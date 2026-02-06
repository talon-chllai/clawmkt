import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Use service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    console.log(`Processing webhook event: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Get customer email
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return;

  const email = customer.email;
  if (!email) {
    console.error("No email found for customer:", customerId);
    return;
  }

  // Upsert subscription record
  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

  if (error) {
    console.error("Error upserting subscription:", error);
    throw error;
  }

  console.log(`Subscription activated for ${email}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  // Map Stripe status to our status
  let status: "active" | "inactive" | "cancelled";
  switch (subscription.status) {
    case "active":
    case "trialing":
      status = "active";
      break;
    case "canceled":
    case "unpaid":
      status = "cancelled";
      break;
    default:
      status = "inactive";
  }

  // Get customer email
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return;

  const email = customer.email;
  if (!email) return;

  // Update subscription status
  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

  if (error) {
    console.error("Error updating subscription:", error);
    throw error;
  }

  console.log(`Subscription ${subscription.status} for ${email}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  // Update subscription to cancelled
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("Error cancelling subscription:", error);
    throw error;
  }

  console.log(`Subscription ${subscriptionId} cancelled`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Get customer email
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return;

  const email = customer.email;
  if (!email) return;

  // Mark subscription as inactive due to payment failure
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "inactive",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Error updating subscription on payment failure:", error);
    throw error;
  }

  console.log(`Payment failed for ${email}, subscription marked inactive`);
}
