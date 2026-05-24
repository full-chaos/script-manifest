# Privileged Audit Coverage Matrix

| Area | Action | Route group | Audit action | Test file |
|---|---|---|---|---|
| Provider review | approve/reject provider | coverage marketplace | `provider.review` | `services/coverage-marketplace-service/src/index.test.ts` |
| Coverage disputes | resolve dispute | coverage marketplace | `coverage.dispute.resolve` | `services/coverage-marketplace-service/src/index.test.ts` |
| Feedback disputes | resolve review dispute | feedback exchange | `feedback.dispute.resolve` | `services/feedback-exchange-service/src/index.test.ts` |
| Ranking prestige | edit competition prestige | ranking | `ranking.prestige.update` | `services/ranking-service/src/index.test.ts` |
| Ranking recompute | trigger recompute | ranking | `ranking.recompute` | `services/ranking-service/src/index.test.ts` |
| Ranking flags | resolve suspicious activity | ranking | `ranking.flag.resolve` | `services/ranking-service/src/index.test.ts` |
| Ranking appeals | resolve appeal | ranking | `ranking.appeal.resolve` | `services/ranking-service/src/index.test.ts` |
| Competition moderation | visibility/access/cancel | competition directory | `competition.moderate` | `services/competition-directory-service/src/index.test.ts` |
| Admin notifications | broadcast/direct/template | notification service | `notification.admin.send` | `services/notification-service/src/admin-routes.test.ts` |
| Feature flags | create/update/delete | identity/admin | `feature_flag.create`, `feature_flag.update`, `feature_flag.delete` | `services/identity-service/src/feature-flag-routes.test.ts` |
| User suspension | suspend/reactivate user | identity/admin | `user.suspend` | `services/identity-service/src/suspension-routes.test.ts` |
| IP blocks | create/delete IP block | identity/admin | `security.ip_block.update` | `services/identity-service/src/ip-block-routes.test.ts` |
