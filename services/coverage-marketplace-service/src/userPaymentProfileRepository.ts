import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";

export type UserPaymentProfile = {
  stripeCustomerId: string;
};

export interface UserPaymentProfileRepository {
  findByUserId(userId: string): Promise<UserPaymentProfile | null>;
  create(userId: string, stripeCustomerId: string): Promise<void>;
}

export class PgUserPaymentProfileRepository implements UserPaymentProfileRepository {
  async findByUserId(userId: string): Promise<UserPaymentProfile | null> {
    const result = await getPool().query<UserPaymentProfileRow>(
      `SELECT stripe_customer_id FROM user_payment_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!result.rows[0]) {
      return null;
    }

    return { stripeCustomerId: result.rows[0].stripe_customer_id };
  }

  async create(userId: string, stripeCustomerId: string): Promise<void> {
    await getPool().query(
      `INSERT INTO user_payment_profiles (id, user_id, stripe_customer_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [`uppr_${randomUUID()}`, userId, stripeCustomerId]
    );
  }
}

export class MemoryUserPaymentProfileRepository implements UserPaymentProfileRepository {
  private profilesByUserId = new Map<string, UserPaymentProfile>();

  async findByUserId(userId: string): Promise<UserPaymentProfile | null> {
    return this.profilesByUserId.get(userId) ?? null;
  }

  async create(userId: string, stripeCustomerId: string): Promise<void> {
    this.profilesByUserId.set(userId, { stripeCustomerId });
  }
}

type UserPaymentProfileRow = {
  stripe_customer_id: string;
};
