import type {
  CoverageProvider,
  CoverageProviderCreateRequest,
  CoverageProviderUpdateRequest,
  CoverageProviderFilters,
  CoverageProviderReview,
  CoverageProviderReviewRequest,
  CoverageService,
  CoverageServiceCreateRequest,
  CoverageServiceUpdateRequest,
  CoverageServiceFilters,
  CoverageOrder,
  CoverageOrderFilters,
  CoverageDelivery,
  CoverageDeliveryCreateRequest,
  CoverageReview,
  CoverageReviewCreateRequest,
  CoverageDispute,
  CoverageDisputeCreateRequest,
  CoverageDisputeResolveRequest,
  CoverageDisputeEvent,
  CoverageDisputeStatus
} from "@script-manifest/contracts";

export interface CoverageMarketplaceRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  // Providers
  createProvider(userId: string, input: CoverageProviderCreateRequest): Promise<CoverageProvider>;
  getProvider(providerId: string): Promise<CoverageProvider | null>;
  getProviderByUserId(userId: string): Promise<CoverageProvider | null>;
  updateProvider(providerId: string, input: CoverageProviderUpdateRequest): Promise<CoverageProvider | null>;
  updateProviderStripe(providerId: string, stripeAccountId: string, onboardingComplete: boolean): Promise<CoverageProvider | null>;
  updateProviderStatus(providerId: string, status: string): Promise<CoverageProvider | null>;
  listProviders(filters: CoverageProviderFilters): Promise<CoverageProvider[]>;
  createProviderReview(providerId: string, reviewedByUserId: string, input: CoverageProviderReviewRequest): Promise<CoverageProviderReview>;
  listProviderReviews(providerId: string): Promise<CoverageProviderReview[]>;

  // Services
  createService(providerId: string, input: CoverageServiceCreateRequest): Promise<CoverageService>;
  getService(serviceId: string): Promise<CoverageService | null>;
  updateService(serviceId: string, input: CoverageServiceUpdateRequest): Promise<CoverageService | null>;
  listServicesByProvider(providerId: string): Promise<CoverageService[]>;
  listServices(filters: CoverageServiceFilters): Promise<CoverageService[]>;

  // Orders
  createOrder(params: {
    writerUserId: string;
    providerId: string;
    serviceId: string;
    scriptId: string;
    projectId: string;
    priceCents: number;
    platformFeeCents: number;
    providerPayoutCents: number;
    stripePaymentIntentId: string;
  }): Promise<CoverageOrder>;
  getOrder(orderId: string): Promise<CoverageOrder | null>;
  listOrders(filters: CoverageOrderFilters): Promise<CoverageOrder[]>;
  updateOrderStatus(orderId: string, status: string, extra?: Partial<{
    stripePaymentIntentId: string;
    stripeTransferId: string;
    slaDeadline: string;
    deliveredAt: string;
  }>): Promise<CoverageOrder | null>;

  // Deliveries
  createDelivery(orderId: string, input: CoverageDeliveryCreateRequest): Promise<CoverageDelivery>;
  getDeliveryByOrder(orderId: string): Promise<CoverageDelivery | null>;

  // Reviews
  createReview(orderId: string, writerUserId: string, providerId: string, input: CoverageReviewCreateRequest): Promise<CoverageReview>;
  getReviewByOrder(orderId: string): Promise<CoverageReview | null>;
  listReviewsByProvider(providerId: string): Promise<CoverageReview[]>;
  updateProviderRating(providerId: string): Promise<void>;

  // Disputes
  createDispute(orderId: string, userId: string, input: CoverageDisputeCreateRequest): Promise<CoverageDispute>;
  getDispute(disputeId: string): Promise<CoverageDispute | null>;
  getDisputeByOrder(orderId: string): Promise<CoverageDispute | null>;
  listDisputes(status?: CoverageDisputeStatus): Promise<CoverageDispute[]>;
  resolveDispute(disputeId: string, input: CoverageDisputeResolveRequest): Promise<CoverageDispute | null>;
  createDisputeEvent(params: {
    disputeId: string;
    actorUserId: string;
    eventType: string;
    note?: string | null;
    fromStatus?: CoverageDisputeStatus | null;
    toStatus?: CoverageDisputeStatus | null;
  }): Promise<CoverageDisputeEvent>;
  listDisputeEvents(disputeId: string): Promise<CoverageDisputeEvent[]>;
}
