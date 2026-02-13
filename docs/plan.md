# Recreating Coverfly: Feature Inventory & Build Phases

## Background

Coverfly shut down on August 1, 2025, following a chain of corporate acquisitions (Backstage → Industry Arts → Cast & Crew). It took down related platforms WeScreenplay, ScreenCraft, and The Script Lab with it. Thousands of writers lost their portfolios, competition histories, Red List rankings, and industry connections overnight. The gap is real — no single replacement has fully replicated what Coverfly offered.

---

## Complete Feature Inventory

### 1. Writer Profile & Portfolio

- **Writer Profile**: Bio, demographics, headshot, genre preferences, representation status, writing credits, goals, experience, custom shareable URL, searchable by industry users
- **Project Pages**: Each script gets its own page with title, logline, synopsis, genre, format (feature, pilot, short), page count, accolades auto-displayed
- **Script Hosting**: Upload and store screenplay PDFs (unlimited, free)
- **Draft Management**: Update scripts, move/merge submissions between projects, update submissions mid-competition for a small fee ($5)
- **Co-Writer Support**: Add co-writers with shared credit; one owner manages submissions
- **Privacy Controls**: Private vs. discoverable per-project; granular download permissions (industry-only, specific users, broad member access)
- **Access Workflow**: Request/approve script access with download notifications and full audit trail
- **Writer Resume**: Aggregated view of all competition placements, coverage scores, and accolades across the platform
- **Profile Analytics**: View counts, logline reads, script downloads tracked and visible to the writer

### 2. Competition & Submission Hub

- **Curated Competition Database**: Only vetted, reputable competitions, fellowships, labs, and writing retreats accepted onto the platform
- **Search & Filter**: Browse competitions by format (feature, TV, short), genre, price, deadline, benefits offered
- **Unified Submission Flow**: Submit to multiple competitions from one dashboard without re-entering information
- **Submission Tracking**: Track status of every submission (pending, quarterfinalist, semifinalist, finalist, winner) in one place
- **Auto-Sync**: Competition results from partner programs automatically populate the writer's dashboard
- **Deadline Calendar**: Centralized view of upcoming deadlines across all listed competitions
- **Fee Waiver Program**: Writers can apply to have submission fees waived for select competitions

### 3. Ranking & Discovery System

- **Coverfly Rank / Score**: Composite algorithmic metric aggregating performance across all partner competitions and coverage evaluations — measures "confidence of quality" rather than absolute quality
- **The Red List**: Public leaderboard of top-ranked projects, filterable by genre, format, and timeframe; the primary way industry professionals discovered writers
- **Red List Tiers**: Top 25%, Top 10%, Top 2%, Top 1% designations providing escalating visibility
- **Score Normalization**: Algorithm balanced "tough" vs. "easy" judges across different competitions to ensure fair comparison
- **Time-Decay / Heat Effects**: Recent placements weighted higher; ranking reflected current momentum, not just lifetime accumulation
- **Persistent Badges**: Historical achievements (e.g., "Nicholl Semifinalist 2024") remained visible even as rank decayed over time
- **Trending Writers**: Highlighted writers with recent strong performances or upward momentum

### 4. Coverage Marketplace (Paid Professional Feedback)

- **Curated Coverage Providers**: Vetted professional readers and coverage services aggregated in one marketplace
- **Tiered Coverage Options**: Services for every stage — concept/treatment feedback, early draft notes, polish/proofread, competition-ready assessment
- **Standardized Scoring**: Coverage evaluations fed into the Coverfly Rank algorithm
- **Coverage Browsing**: Writers could compare services by price, turnaround time, and type of feedback offered

### 5. Peer-to-Peer Feedback (CoverflyX)

- **Token-Based Exchange**: Free, no monetary value — earn tokens by reviewing others' scripts, spend tokens to get your own reviewed
- **Bidding System**: Writers set a token bid on their script; higher bids attract readers faster
- **Structured Feedback Format**: 300 words on strengths, 300 words on weaknesses, plus optional additional notes
- **5-Day Completion Window**: Readers must finish within 5 days of claiming a script
- **Reader Ratings**: After receiving feedback, writers rate the reviewer; higher-rated readers get priority access to better scripts
- **Strike System**: Readers who fail to complete on time receive strikes; too many = account suspension
- **Direct Collaboration**: If feedback resonates, writers could connect directly for further collaboration

### 6. Industry Dashboard (B2B Side)

- **Vetted Industry Accounts**: ~2,000 literary managers, agents, studio/network execs, and producers with personally verified credentials
- **Talent Search**: Industry pros could search the database by genre, format, demographics, representation status, competition history, Red List ranking
- **Script Downloads**: Industry members could download scripts from discoverable projects (writers notified of each download)
- **Custom Lists & Notes**: Industry users could save and share custom lists of writers/projects with colleagues
- **Weekly Recommendations**: Coverfly's in-house story analysts and development execs read thousands of scripts monthly, sending vetted, personalized recommendations to industry users
- **Endorsed Writers Program**: Coverfly's development team personally championed select writers, actively connecting them with reps and producers

### 7. Writer Development Programs (All Free)

- **Pitch Week**: Bi-annual event matching top writers with agents, managers, and producers via 12-minute Zoom meetings; merit-based selection from Red List
- **Industry Mandates / OWAs**: Real job postings from studios, networks, showrunners, and production companies seeking specific types of projects or writers; Coverfly's development team curated and forwarded qualified submissions
- **Career Mentorship**: 6-month mentorship pairing with professional working writers
- **Career Lab**: Workshops and talks on craft, career strategy, and the business of screenwriting
- **Live Reads**: Virtual table reads with professional actors, free for selected writers
- **Fee Waiver Program**: Application-based fee waivers for submissions to top partner competitions

### 8. Partner Dashboard (B2B for Competitions)

- **Submission Management**: Competition organizers used Coverfly as their backend for receiving and organizing submissions
- **Reader Assignment & Management**: Tools for distributing scripts to judges and tracking evaluations
- **Score Normalization**: Algorithmic balancing of judge scoring tendencies
- **Results Management**: Publishing placement lists that auto-synced to writer profiles
- **FilmFreeway Integration**: Submissions made through FilmFreeway could flow into Coverfly's tracking system

### 9. Community & Content

- **Writer Success Stories**: Blog featuring writers who signed with reps, sold scripts, or got produced through Coverfly connections
- **Blog / Content Hub**: Articles on craft, career advice, industry trends, competition guides
- **Community Engagement**: Social presence, email newsletters, event announcements

---

## Phased Rebuild Plan

### Phase 0: Product & Legal Foundation (Weeks 1–3)

**Goal**: Get the non-code decisions right before writing a line of code.

**Deliverables**:
- Brand identity and naming (non-infringing — Coverfly's trademarks like "Red List," "CoverflyX," and "Coverfly Rank" are still owned by Cast & Crew)
- Scoring transparency policy (publish the methodology before the algorithm exists)
- Content moderation policy (plagiarism, AI-generated scripts, harassment in feedback, DMCA process)
- Data model locked: Users, Projects, Drafts, Co-Writers, Programs, Submissions, Placements, Notes, RankEvents, Tokens
- Data portability commitment (CSV/PDF export of all user data — differentiate from Coverfly's overnight disappearing act)
- Privacy and IP protection policy (writers retain all rights, scripts never shared without consent)
- Notification architecture design (deadline reminders, download alerts, submission updates, token claims — this is a horizontal concern that touches every phase)

**Why First**: Coverfly's shutdown proved that trust is the product. Writers lost years of portfolio data overnight. Starting with transparency policies, data portability, and a locked data model prevents costly refactors and establishes credibility from day one.

---

### Phase 1: MVP Hub — Profiles, Hosting & Competition Directory (Weeks 4–12)

**Goal**: Give writers a home and the competition directory that eliminates Google searching. Ship with a lightweight leaderboard so the platform has a competitive hook from launch.

**Core Features**:
- User registration/authentication (email + OAuth)
- Writer profile creation (bio, photo, demographics, genre preferences, custom URL, searchable)
- Project creation with logline, synopsis, genre, format tags
- PDF script upload and storage with in-browser viewer
- Draft management: update scripts, move/merge submissions between projects
- Co-writer support with shared credit and single-owner submission control
- Privacy controls: private / discoverable / granular download permissions (industry-only, specific users, broad access)
- Request/approve script access workflow with download notifications and audit trail
- Competition/fellowship/lab directory with rich metadata (deadlines, fees, formats, benefits, eligibility, links)
- Search and filter by genre, format, price range, deadline proximity
- Deadline calendar view with save/follow and email reminders
- Submission tracking dashboard (manual entry: "I submitted X to Y on Z date")
- Placement recording (writer self-reports placements with verification workflow)
- Admin CMS for curating and vetting competition listings
- Lightweight leaderboard: simple ranking based on self-reported placements, filterable by genre and format — not the full algorithm, but enough to surface active writers
- Responsive PWA (mobile-friendly from day one)

**Tech Considerations**:
- Cloud storage for scripts (S3/R2/GCS) with CDN delivery
- PostgreSQL for relational data
- Full-text search on loglines/synopses (Elasticsearch or pg_trgm)
- Notification service (email + push) as a shared infrastructure layer

**Why First**: This is the minimum viable product that solves the two most immediate needs: a place to host work, and a single directory for all competitions. The lightweight leaderboard gives the platform a discovery hook that no other alternative currently offers at launch. Every subsequent feature depends on profiles and projects existing.

---

### Phase 2: Paid Coverage Marketplace (Weeks 13–20)

**Goal**: Aggregate professional coverage services, generate the platform's first revenue, and establish payment infrastructure that later phases depend on.

**Core Features**:
- Coverage provider onboarding and vetting process
- Provider profiles (background, services offered, turnaround time, pricing)
- Service tiers: concept/treatment notes, early draft development, polish/proofread, competition-ready assessment
- Order flow: writer selects service → pays → provider delivers coverage
- Coverage scores that will feed into the ranking algorithm (Phase 3)
- Provider ratings and reviews from writers
- Provider dashboard: manage orders, communicate with writers, track earnings
- Payment processing with platform commission on each transaction
- Escrow/milestone-based release (payment held until delivery confirmed)
- Dispute resolution workflow
- Refund handling
- Tax reporting infrastructure (1099s for providers)

**Tech Considerations**:
- Stripe for payments (Connect for provider payouts)
- Order state machine (placed → claimed → in-progress → delivered → rated)
- Secure document delivery (coverage reports)

**Why Second**: Professional coverage providers are easier to onboard and quality-control than a peer-to-peer token economy. You're dealing with businesses that have existing reputations and financial incentives to deliver. This phase also establishes the payment rails, dispute resolution, and provider dashboard patterns that the peer exchange will later adapt. Most critically, it generates revenue to fund everything that follows.

---

### Phase 3: Full Ranking Algorithm & Leaderboard (Weeks 21–26)

**Goal**: Replace the lightweight Phase 1 leaderboard with the real scoring engine.

**Core Features**:
- Ranking algorithm that weights:
  - Competition placements (weighted by competition prestige tier)
  - Coverage scores from marketplace providers
  - Number of evaluations (more data = higher confidence)
  - Time-decay / "heat" effects (recent placements weighted higher)
  - Historical achievement persistence (badges don't disappear when rank decays)
- Score normalization framework: balance "tough" vs. "easy" judges when partner competitions integrate
- Project-level rank score displayed on project pages
- Public leaderboard (the "Red List" equivalent) filterable by genre, format, and timeframe
- Tier designations: Top 25%, Top 10%, Top 2%, Top 1%
- Trending / rising writers section
- Persistent badges for historical achievements (e.g., "Nicholl Semifinalist 2024") that remain even as rank decays
- Published algorithm methodology (transparency builds trust)
- Anti-gaming rules: duplicate entry detection, suspicious feedback loops, fake placement verification
- Appeals and dispute process

**Tech Considerations**:
- Batch recalculation (nightly) plus event-driven updates for new placements
- Placement ingestion: API integrations where available, manual import with verification elsewhere
- Data migration strategy: allow writers to re-enter historical Coverfly placements; explore partnerships with competitions to backfill data; evaluate importing from Stage 32 where writers transferred their Coverfly profiles
- Fraud detection pipeline

**Why Third**: By this point you have profiles, self-reported competition histories from Phase 1, and professional coverage scores from Phase 2 — enough real data to power a credible algorithm. Building ranking earlier would produce an empty or gameable leaderboard. Building it later would mean the peer exchange and industry portal launch without the scoring system they depend on.

---

### Phase 4: Peer-to-Peer Feedback Exchange (Weeks 27–36)

**Goal**: Recreate the token-based script exchange for free peer feedback.

**Core Features**:
- Token system (non-monetary, earned by reviewing, spent to get reviewed; database ledger, not blockchain)
- Script queue / marketplace where writers post scripts with token bids
- Bidding dynamics: higher bids attract readers faster; low bids may go unclaimed
- Claiming system: reader claims a script, gets 5-day completion window
- Structured feedback form: 300 words on strengths, 300 words on weaknesses, optional additional notes
- Reader rating system (1–5 stars on quality of feedback received)
- Quality-gating: higher-rated readers get priority access to scripts from other high-rated readers
- Strike system for non-completion (too many strikes = suspension)
- Direct messaging between matched writer/reader pairs for follow-up collaboration
- Peer review quality signals that feed into the ranking algorithm
- Abuse prevention: spam detection, low-quality note filtering, collusion detection (e.g., mutual 5-star rating rings)
- Arbitration queue for disputed feedback

**Tech Considerations**:
- Token ledger with transaction history
- Matching algorithm (consider script length, genre preferences, reader ratings, availability)
- Content moderation tooling for feedback text
- Rate limiting to prevent marketplace manipulation

**Why Fourth**: The peer exchange is the community engine that drives engagement and retention. It comes after paid coverage because the marketplace patterns (ordering, delivery, ratings, disputes) are already proven in Phase 2, and the ranking algorithm from Phase 3 is live to incorporate peer signals. The token economy also requires more complex abuse prevention than professional services.

---

### Phase 5: Industry Portal & Discovery Dashboard (Weeks 37–46)

**Goal**: Build the B2B side that makes the platform career-changing for writers and valuable for agents, managers, and producers.

**Core Features**:
- Industry account registration with manual vetting and credential verification
- Talent search with filters: genre, format, demographics, representation status, rank tier, competition history, keywords
- Script download capability with writer notification on every download
- Granular access controls: writers choose which industry members (or tiers) can access their scripts
- Custom lists, notes, and favorites for industry users
- Team collaboration: shared lists and notes across colleagues at the same company
- Weekly digest emails with curated recommendations (initially manual, later algorithmic)
- Download and engagement analytics for industry users
- Writer-facing analytics: who viewed your profile, read your logline, downloaded your script
- Curated mandate board: active requests from studios, networks, showrunners, and production companies seeking specific types of projects or writers
- Mandate submission workflow: writers submit projects with fit explanation; editorial team reviews and forwards qualified submissions
- OWAs (Open Writing Assignments): similar flow to mandates for specific hire opportunities

**Stretch Goals**:
- Recommendation engine based on industry user browsing and download history
- Development team curation: human-in-the-loop recommendations (requires hiring story analysts)

**Tech Considerations**:
- CRM integration for managing industry relationships
- Vetting workflow tooling (verify credits, company affiliation)
- Analytics pipeline for engagement tracking
- Permission system that handles writer-side and industry-side access independently

**Why Fifth**: This is the feature that made Coverfly irreplaceable — the bridge between writers and the industry. It requires the hardest thing to build: trust and relationships with industry professionals, which only works if you can show them a populated, ranked, quality-filtered database of writers. By this point, you have profiles, competition data, coverage scores, peer reviews, and a functioning leaderboard to present.

---

### Phase 6: Programs & Events (Weeks 47–60+)

**Goal**: Launch the high-touch programs that differentiate from a database. Each program is a separate rollout.

**Program Rollouts** (roughly in order of operational complexity):

1. **Fee Waiver Program**: Application-based fee waivers for submissions to partner competitions. Lowest complexity — just an application review workflow and partner coordination.

2. **Career Lab**: Workshops and talks on craft, career strategy, and the business of screenwriting. Requires event scheduling, registration, and content hosting (recorded sessions).

3. **Career Mentorship**: 6-month mentorship pairing with professional working writers. Application, matching, progress tracking. Requires recruiting mentor pool.

4. **Live Reads**: Virtual table reads with professional actors. Scheduling, actor coordination, streaming infrastructure. Free for selected writers.

5. **Pitch Week**: Bi-annual event matching top writers (selected from leaderboard) with agents, managers, and producers via timed Zoom meetings. Requires scheduling infrastructure, video integration, selection committee, and deep industry relationships.

6. **Industry Mandates (expanded)**: Scale the mandate board from Phase 5 into a full program with dedicated development team actively sourcing opportunities, reading scripts, and personally championing writers to industry contacts.

**Tech Considerations**:
- Video conferencing integration (Zoom API or similar)
- Scheduling and calendar system
- Application review workflow (internal tooling)
- CRM for industry relationship management
- Event streaming infrastructure for Live Reads

**Why Last**: These programs are operationally intensive and require dedicated staff — development execs, story analysts, event coordinators. They depend on having critical mass of both writers and industry professionals on the platform. Each program can be launched independently as resources and relationships allow.

---

### Phase 7: Partner Dashboard for Competition Organizers (Optional / Weeks 60+)

**Goal**: Become the backend platform that competitions run on, not just a directory that lists them.

**Core Features**:
- Competition organizer accounts with admin tools
- Submission receiving and management
- Reader/judge assignment and workload distribution
- Evaluation forms and scoring infrastructure
- Score normalization across judges (balance tough vs. easy graders)
- Results management and publication (auto-syncs to writer profiles and ranking)
- Entrant communication tools
- Analytics for organizers (submission demographics, completion rates)
- FilmFreeway integration (submissions flow between platforms)
- Draft update mid-competition ($5 fee — small revenue stream)

**Why Optional/Last**: This transforms the platform from a directory into an infrastructure provider. It's the deepest moat — if competitions run on your backend, their data flows directly into your ranking system and writers never leave the ecosystem. However, it's a significant engineering investment and only makes sense once you have enough competition partnerships to justify it. Many platforms succeed without this (The Black List, ISA, Stage 32 all function as directories rather than backends).

---

## Revenue Model Considerations

| Revenue Stream | Phase Available | Notes |
|---|---|---|
| Competition listing fees (from organizers) | Phase 1 | Charge competitions to be listed/featured |
| Draft update fees ($5) | Phase 7 | Small fee for mid-competition draft swaps (requires partner dashboard) |
| Coverage marketplace commission | Phase 2 | Percentage of each coverage transaction |
| Premium writer features | Phase 3+ | Enhanced analytics, featured placement, priority support |
| Industry dashboard subscriptions | Phase 5 | Monthly/annual fee for industry access |
| Sponsored/featured competitions | Phase 1 | Promoted placement in competition listings |
| API access for partners | Phase 7+ | Partner integrations at scale |

---

## Key Strategic Notes

1. **Community first, monetization second.** Coverfly was free for writers and that was essential to adoption. The new platform should maintain a robust free tier.

2. **Data portability matters.** Let writers export their data. The Coverfly shutdown proved that lock-in erodes trust. Offer CSV/PDF export of placements, scores, and profiles.

3. **Competition partnerships are the flywheel.** The more competitions you partner with, the more writers come. The more writers you have, the more competitions want to list. Prioritize outreach to major competitions (Austin Film Festival, Nicholl, PAGE, Script Pipeline, etc.) early.

4. **The industry side requires human curation.** Coverfly's development team was irreplaceable — they personally read scripts, endorsed writers, and built relationships with reps. Technology alone won't replicate this. Budget for a small editorial/development team by Phase 6.

5. **Existing alternatives to differentiate against**: Scrybe (free hosting + tracking), Script Revolution (free hosting), Stage 32 (networking + imported Coverfly data), Kinolime (competitions + coverage), The Black List (paid hosting + industry reads), ISA (networking + gigs). Your advantage is being comprehensive — the one-stop hub Coverfly was.

6. **Open-source or community-governed options.** Given the community's frustration with Coverfly's corporate-driven shutdown, consider a governance structure that gives writers a voice (advisory board, transparent roadmap, community input on features).
