// src/modules/payments/payments-webhook.controller.ts
import { Router, Request, Response } from 'express';
import { stripeService } from './services/stripe.service';
import { subscriptionService } from './services/subscription.service';
import { paymentService } from './services/payment.service';
import { premiumFeaturesService } from './services/premium-features.service';
import { PaymentStatus, PaymentMethodType } from '@prisma/client';
import Stripe from 'stripe';

const router = Router();

/**
 * POST /api/v1/webhooks/stripe
 * Webhook de Stripe - Recibe eventos de pagos y suscripciones
 *
 * IMPORTANTE: Este endpoint debe configurarse con express.raw() para recibir el body sin parsear
 */
router.post(
  '/',
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;

    if (!sig) {
      console.error('Webhook sin firma');
      return res.status(400).send('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // El body debe ser Buffer (configurado en main.ts con express.raw)
      event = stripeService.constructWebhookEvent(req.body, sig);
    } catch (err) {
      console.error('Error verificando webhook:', err);
      return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    console.log(`📨 Webhook recibido: ${event.type}`);

    try {
      switch (event.type) {
        // ==================== CHECKOUT ====================

        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;

          if (session.mode === 'subscription' && session.subscription) {
            const metadata = session.metadata as {
              userId: string;
              planId: string;
              billingCycle: string;
            };

            if (metadata?.userId && metadata?.planId) {
              await subscriptionService.processCheckoutCompleted(
                session.subscription as string,
                session.customer as string,
                metadata
              );
              premiumFeaturesService.invalidateCache(metadata.userId);
              console.log(`✅ Checkout completado para usuario ${metadata.userId}`);
            }
          }
          break;
        }

        // ==================== SUSCRIPCIONES ====================

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;

          if (subscription.id) {
            await subscriptionService.syncFromStripe(subscription.id);
            console.log(`✅ Suscripción sincronizada: ${subscription.id}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;

          // Buscar usuario por stripeSubscriptionId y degradar a plan gratuito
          const { PrismaClient } = await import('@prisma/client');
          const prisma = new PrismaClient();

          const dbSubscription = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId: subscription.id },
          });

          if (dbSubscription) {
            await subscriptionService.downgradeToFree(dbSubscription.userId);
            premiumFeaturesService.invalidateCache(dbSubscription.userId);
            console.log(`✅ Usuario ${dbSubscription.userId} degradado a plan gratuito`);
          }
          break;
        }

        // ==================== PAGOS ====================

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          // Actualizar pago en BD
          await paymentService.updatePaymentByStripeId(paymentIntent.id, {
            status: PaymentStatus.SUCCEEDED,
            paidAt: new Date(),
            stripeChargeId: paymentIntent.latest_charge as string || undefined,
          });

          console.log(`✅ Pago exitoso: ${paymentIntent.id}`);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          await paymentService.updatePaymentByStripeId(paymentIntent.id, {
            status: PaymentStatus.FAILED,
            failureCode: paymentIntent.last_payment_error?.code || undefined,
            failureMessage: paymentIntent.last_payment_error?.message || undefined,
          });

          console.log(`❌ Pago fallido: ${paymentIntent.id}`);
          break;
        }

        case 'payment_intent.requires_action': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          await paymentService.updatePaymentByStripeId(paymentIntent.id, {
            status: PaymentStatus.REQUIRES_ACTION,
          });

          console.log(`⏳ Pago requiere acción: ${paymentIntent.id}`);
          break;
        }

        // ==================== INVOICES ====================

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;

          // Crear registro de pago
          if (invoice.customer && invoice.subscription) {
            const { PrismaClient } = await import('@prisma/client');
            const prisma = new PrismaClient();

            const subscription = await prisma.subscription.findFirst({
              where: { stripeCustomerId: invoice.customer as string },
            });

            if (subscription) {
              await paymentService.createPayment({
                userId: subscription.userId,
                subscriptionId: subscription.id,
                stripeInvoiceId: invoice.id,
                stripePaymentIntentId: invoice.payment_intent as string || undefined,
                amount: invoice.amount_paid / 100,
                currency: invoice.currency.toUpperCase(),
                paymentMethod: PaymentMethodType.CARD,
                status: PaymentStatus.SUCCEEDED,
                description: `Pago de suscripción - ${invoice.lines.data[0]?.description || 'Sistema VIDA'}`,
                paidAt: new Date(),
              });

              console.log(`✅ Invoice pagada registrada: ${invoice.id}`);
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;

          console.log(`❌ Invoice fallida: ${invoice.id}`);
          // TODO: Enviar notificación al usuario
          break;
        }

        // ==================== OXXO ====================

        case 'payment_intent.processing': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          // Verificar si es pago OXXO
          if (paymentIntent.payment_method_types?.includes('oxxo')) {
            const voucherUrl = (paymentIntent.next_action as {
              oxxo_display_details?: { hosted_voucher_url?: string };
            })?.oxxo_display_details?.hosted_voucher_url;

            const expiresAt = (paymentIntent.next_action as {
              oxxo_display_details?: { expires_after?: number };
            })?.oxxo_display_details?.expires_after;

            await paymentService.updatePaymentByStripeId(paymentIntent.id, {
              status: PaymentStatus.REQUIRES_ACTION,
            });

            // Crear pago si no existe
            const metadata = paymentIntent.metadata as { userId?: string };
            if (metadata?.userId) {
              const { PrismaClient } = await import('@prisma/client');
              const prisma = new PrismaClient();

              const existingPayment = await prisma.payment.findFirst({
                where: { stripePaymentIntentId: paymentIntent.id },
              });

              if (!existingPayment) {
                await paymentService.createPayment({
                  userId: metadata.userId,
                  stripePaymentIntentId: paymentIntent.id,
                  amount: paymentIntent.amount / 100,
                  currency: paymentIntent.currency.toUpperCase(),
                  paymentMethod: PaymentMethodType.OXXO,
                  status: PaymentStatus.REQUIRES_ACTION,
                  description: paymentIntent.description || 'Pago OXXO',
                  oxxoVoucherUrl: voucherUrl || undefined,
                  oxxoExpiresAt: expiresAt ? new Date(expiresAt * 1000) : undefined,
                });
              }
            }

            console.log(`🏪 Pago OXXO en proceso: ${paymentIntent.id}`);
          }
          break;
        }

        // ==================== OTROS EVENTOS ====================

        case 'customer.created':
        case 'customer.updated':
          // Log para debugging
          console.log(`📋 Cliente actualizado: ${(event.data.object as Stripe.Customer).id}`);
          break;

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;

          if (charge.payment_intent) {
            await paymentService.updatePaymentByStripeId(charge.payment_intent as string, {
              status: PaymentStatus.REFUNDED,
            });
            console.log(`💰 Reembolso procesado: ${charge.id}`);
          }
          break;
        }

        default:
          console.log(`📌 Evento no manejado: ${event.type}`);
      }

      // Responder 200 para confirmar recepción
      res.status(200).json({ received: true });
    } catch (error) {
      console.error(`Error procesando webhook ${event.type}:`, error);
      // Aún así responder 200 para evitar reintentos de Stripe
      res.status(200).json({ received: true, error: 'Processing error' });
    }
  }
);

export default router;
