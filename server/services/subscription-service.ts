import { db } from './database-service';
import { subscriptions, userProfiles, therapistClientRelationships, usageSessions } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class SubscriptionService {
  async getSubscriptionLimits(userId: string) {
    // Check if client with therapist
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.id, userId)
    });

    if (profile?.userType === 'client' && profile.invitedBy) {
      // Check active relationship
      const relationship = await db.query.therapistClientRelationships.findFirst({
        where: and(
          eq(therapistClientRelationships.clientId, userId),
          eq(therapistClientRelationships.therapistId, profile.invitedBy),
          eq(therapistClientRelationships.status, 'active')
        )
      });

      if (relationship) {
        // Use therapist's subscription
        return this.getSubscriptionLimits(profile.invitedBy);
      }
    }

    // Get own subscription
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, userId)
    });

    if (!subscription) {
      // Create trial if missing
      await this.createTrialSubscription(userId);
      return this.getSubscriptionLimits(userId);
    }

    const now = new Date();
    const isExpired = subscription.subscriptionStatus === 'expired' ||
      (subscription.trialEndsAt && subscription.trialEndsAt < now);

    return {
      can_use_voice: !isExpired && subscription.usageMinutesUsed < subscription.usageMinutesLimit,
      minutes_remaining: Math.max(0, subscription.usageMinutesLimit - subscription.usageMinutesUsed),
      subscription_active: !isExpired,
      is_trial: subscription.subscriptionStatus === 'trialing',
      trial_days_left: subscription.trialEndsAt ? 
        Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
    };
  }

  async canStartVoiceSession(userId: string): Promise<boolean> {
    const limits = await this.getSubscriptionLimits(userId);
    return limits.can_use_voice;
  }

  async trackUsageSession(userId: string, minutes: number, sessionId?: string, callId?: string) {
    // Record usage
    await db.insert(usageSessions).values({
      userId,
      durationMinutes: Math.ceil(minutes),
      therapeuticSessionId: sessionId,
      vapiCallId: callId,
    });

    // Update subscription
    await db.update(subscriptions)
      .set({ 
        usageMinutesUsed: sql`${subscriptions.usageMinutesUsed} + ${Math.ceil(minutes)}`,
        updatedAt: new Date()
      })
      .where(eq(subscriptions.userId, userId));

    return true;
  }

  async createTrialSubscription(userId: string) {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    await db.insert(subscriptions).values({
      userId,
      subscriptionTier: 'trial',
      subscriptionStatus: 'trialing',
      planType: 'recurring',
      trialEndsAt: trialEndDate,
      trialMinutesLimit: 45,
      usageMinutesLimit: 45,
    });

    return true;
  }
}

export const subscriptionService = new SubscriptionService();