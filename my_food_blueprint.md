Restaurant Dining Experience Platform

Product Requirements & Technical Blueprint for Coding Agents

Version: 1.0
Date: September 2026
Status: MVP Planning

1. Product Vision

Build a restaurant dining platform that improves the in-restaurant experience by combining:

Digital restaurant menus

Dish-level ratings and reviews

Verified diner feedback

Personalized/popular dish discovery

Table-aware ordering

Restaurant order management

Restaurant analytics

The core product insight is:

A traditional menu tells a diner what dishes exist and how much they cost. This product tells them what is actually worth ordering.

The product should initially be restaurant-first and QR-first. Diners should not need to install a mobile application to use the core experience.

Primary flow:

Scan QR → Discover dishes → Evaluate dishes using ratings/reviews → Add to cart → Order → Receive order status → Review purchased dishes

2. Product Positioning

Do NOT position the MVP primarily as a generic QR ordering system.

Primary positioning:

A dish discovery and ordering experience for restaurants.

Long-term positioning:

The app that tells you what to eat.

The ordering system is the mechanism that generates verified behavioral data. The long-term product value is the dish-level recommendation and feedback dataset.

3. Goals

MVP Goals

Allow restaurants to create and manage menus.

Allow restaurants to create tables and QR codes.

Allow diners to open a restaurant menu by scanning a QR code.

Show dish prices, photos, ratings, review counts, and useful review information.

Allow diners to add dishes to a cart.

Allow diners to place table-specific orders.

Allow restaurants to receive and manage orders.

Allow diners to rate dishes they actually purchased.

Ensure reviews are tied to completed orders.

Provide basic restaurant analytics.

Non-Goals for MVP

Do not build these initially:

Social network/following system

Complex recommendation AI

Restaurant marketplace/discovery across the city

Delivery

Reservations

Loyalty points

Complex payment gateway integrations

Native iOS/Android applications

Advanced restaurant accounting

AI-generated reviews

Public anonymous reviews without purchase verification

These can be added later.

4. User Types

4.1 Diner

A customer physically dining at a restaurant.

Primary needs:

Understand what dishes are good.

Compare dishes.

See what other diners think.

Order without waiting for a waiter.

Track the order.

Provide feedback.

The diner should be able to use the core product without creating an account.

4.2 Restaurant Staff

Restaurant employee who handles orders.

Needs:

See incoming orders.

See table number.

Accept/reject orders if required.

Update order status.

Mark orders completed.

Handle unavailable dishes.

4.3 Restaurant Manager/Owner

Needs:

Manage restaurant profile.

Manage menu categories.

Manage dishes.

Manage prices.

Manage tables.

Generate QR codes.

View orders.

View reviews.

View analytics.

4.4 Platform Admin

Future role.

Needs:

Manage restaurants.

Moderate reviews.

Handle abuse.

View platform-level analytics.

Manage users and permissions.

Do not overbuild this for MVP.

5. Core Customer Experience

5.1 QR Entry

Each restaurant table has a unique QR code.

Example:

https://app.example.com/r/{restaurantSlug}/t/{tableToken}

The QR identifies:

Restaurant

Table

The customer should not need to manually select the restaurant or table.

6. Customer Screen Flow

Screen 1: Restaurant Landing/Menu

Display:

Restaurant name

Restaurant logo/photo

Overall restaurant rating

Number of ratings

Restaurant description

Menu categories

Search

Popular dishes

Recommended/featured dishes

Example:

--------------------------------
Restaurant Name
⭐ 4.6 · 1,248 ratings

[ Search dishes... ]

🔥 Most Loved

Chicken Sekuwa
⭐ 4.8 · 238 ratings
Rs. 450

Momo
⭐ 4.7 · 512 ratings
Rs. 280

-------------------------------
Categories

Momo
Starters
Main Course
Pizza
Drinks
Desserts
--------------------------------

7. Dish Card

Every dish card should show:

Dish image

Dish name

Price

Average rating

Number of ratings

Optional recommendation percentage

Popularity indicator

Availability status

Example:

Chicken Sekuwa

⭐ 4.8
238 ratings

Rs. 450

🔥 Popular

[ Add ]

Avoid excessive information on the card. The card should be scannable.

8. Dish Details Screen

When a diner opens a dish:

Display:

Large dish image

Dish name

Description

Price

Average rating

Number of ratings

Rating distribution

Recommendation percentage

Review tags

Recent reviews

Quantity selector

Add to cart button

Example:

Chicken Sekuwa
Rs. 450

⭐ 4.8
238 verified ratings

89% would order again

Taste       ⭐ 4.8
Portion     ⭐ 4.4
Value       ⭐ 4.5

People often say:
[ Smoky ] [ Juicy ] [ Good portion ]

Reviews

★★★★★
"Smoky and juicy. The achar is excellent."
Verified diner

★★★★☆
"Very tasty, slightly spicy."
Verified diner

[ Add to Cart ]

9. Rating Model

Do not rely only on a single 1-5 star rating.

For MVP collect:

Overall rating: 1-5

Taste: 1-5

Portion: 1-5

Value for money: 1-5

Would order again: boolean

Optional written comment

Optional predefined tags

Possible tags:

Delicious

Spicy

Mild

Crispy

Juicy

Fresh

Large portion

Small portion

Good value

Expensive

Great presentation

Kid friendly

Restaurant-specific tags can be introduced later.

10. Verified Reviews

Reviews must be connected to an actual purchase.

Required rule:

A diner can review a dish only if that diner has an eligible completed order containing that dish.

Recommended review eligibility:

Order status = COMPLETED

Dish was actually included in order

One review per purchased dish per order

Optional future rule:

Allow an aggregated lifetime review update after multiple purchases.

Review should display:

Verified purchase

Do not expose private order information.

11. Review Quality and Anti-Abuse

MVP protections:

Reviews require a completed order.

One review per dish per order.

Prevent duplicate submissions.

Allow restaurant staff to flag suspicious reviews.

Platform admin can hide/remove reviews.

Rate-limit review submission.

Store timestamps and order references internally.

Future protections:

Device/session abuse detection

Suspicious review scoring

Account reputation

Fraud detection

Review moderation

12. Useful Dish Metrics

The system should calculate:

Average Rating

Average of overall ratings.

Rating Count

Number of verified ratings.

Recommendation Rate

Percentage of reviewers answering "Would order again?"

Example:

89% would order again

Popularity

Based on order count over a configurable time period.

Trending

Recent order velocity compared with historical baseline.

Hidden Gem

Potential rule:

Rating >= 4.5

Minimum rating count reached

Order volume relatively low

Do not hardcode business thresholds throughout the UI. Make thresholds configurable.

13. Restaurant Menu Structure

Hierarchy:

Restaurant
  └── Menu
       ├── Category
       │    ├── Dish
       │    ├── Dish
       │    └── Dish
       ├── Category
       │    └── Dish
       └── Category

A restaurant can have:

Multiple categories

Multiple dishes per category

Ordering/sort position

Availability state

14. Dish Data

Minimum dish fields:

id
restaurantId
categoryId
name
slug
description
imageUrl
price
currency
isAvailable
isFeatured
sortOrder
createdAt
updatedAt

Recommended future fields:

preparationTime
dietaryTags
allergens
spiceLevel
servingSize
ingredients

15. Restaurant Data

Minimum:

id
name
slug
description
logoUrl
coverImageUrl
currency
timezone
status
createdAt
updatedAt

16. Table Data

id
restaurantId
name
number
qrToken
capacity
status
createdAt
updatedAt

Table status can eventually include:

AVAILABLE

OCCUPIED

DISABLED

For MVP, table status does not need to control ordering unless the restaurant requires it.

17. Ordering Flow

Customer:

Restaurant Menu
      ↓
Dish
      ↓
Add to Cart
      ↓
Cart
      ↓
Confirm Order
      ↓
Order Created
      ↓
Restaurant Receives Order
      ↓
Accepted
      ↓
Preparing
      ↓
Ready
      ↓
Completed
      ↓
Review

18. Cart

Cart should contain:

Dish

Quantity

Unit price at time of adding/order

Optional item note

Subtotal

Important:

The final order must store the price at purchase time.

If a restaurant later changes:

Momo Rs. 250 → Rs. 300

old orders must still show:

Momo × 2 @ Rs. 250

19. Order Data

Recommended:

id
restaurantId
tableId
sessionId
status
subtotal
tax
serviceCharge
discount
total
currency
customerId nullable
createdAt
updatedAt
completedAt nullable

Order item:

id
orderId
dishId
dishNameSnapshot
unitPrice
quantity
notes
createdAt

Store dish name and price snapshots so historical orders remain correct even if menu data changes.

20. Order Status

MVP statuses:

PENDING
ACCEPTED
PREPARING
READY
COMPLETED
CANCELLED

Possible future status:

REJECTED
REFUNDED

Customer should see a simple status timeline.

Example:

✓ Order placed

✓ Restaurant accepted

✓ Preparing

● Ready

○ Completed

21. Table Session

A table should have a dining session concept.

Example:

Table 7
   ↓
Dining Session #123
   ↓
Order #1001
   ↓
Order #1002
   ↓
Order #1003

This enables future features such as:

Multiple orders from one table

Shared table ordering

Group ordering

Split bills

Reordering

Table-level bill

For MVP, implement the concept even if the UI only supports a simple flow.

22. Anonymous Diner Identity

Do not require account creation for MVP.

Generate a temporary diner/session identifier.

Example:

DiningSession
id
restaurantId
tableId
anonymousSessionToken
startedAt
expiresAt

This session can be used to:

Associate orders

Prevent duplicate reviews

Maintain cart

Maintain current table context

Future users can link the session to an account.

23. Authentication

Restaurant users should require authentication.

Diners:

No authentication for browsing.

No authentication for initial ordering if possible.

Optional phone/email authentication can be added for payments, order history, loyalty, etc.

Do not introduce unnecessary authentication friction into the QR experience.

24. Customer Home Experience

Inside a restaurant, prioritize:

Most Loved

Highest-rated dishes with sufficient review count.

Most Ordered

Highest order volume.

Trending

Recent popularity.

Hidden Gems

High satisfaction but lower exposure.

Good Value

High rating relative to price.

Staff Pick

Restaurant-selected recommendations.

These are merchandising sections, not separate database entities.

25. Search and Filtering

MVP search:

Dish name

Category

Future filters:

Rating

Price

Vegetarian

Vegan

Spicy

Popular

Recommended

Dietary restrictions

Allergens

26. Restaurant Dashboard

Main navigation:

Dashboard
Orders
Menu
Categories
Tables
Reviews
Analytics
Settings

27. Restaurant Dashboard: Orders

Show:

New orders

Active orders

Completed orders

Cancelled orders

Order card:

Order #1023
Table 7

2 × Chicken Sekuwa
1 × Momo
2 × Coke

Total: Rs. 1,430

[ Accept ]

After acceptance:

[ Preparing ]

Then:

[ Ready ]

Then:

[ Complete ]

28. Menu Management

Restaurant manager can:

Create category

Rename category

Delete category

Reorder categories

Create dish

Edit dish

Delete/archive dish

Change price

Upload image

Toggle availability

Feature dish

Reorder dishes

Important:

Prefer archive/deactivate over hard-delete for dishes with historical orders.

29. Table Management

Restaurant manager can:

Create tables

Rename tables

Disable tables

Generate QR code

Regenerate QR code

Download/print QR code

QR should be stable enough that restaurants can print it permanently.

Do not encode mutable menu data directly into the QR.

The QR should identify the restaurant/table, while the backend resolves the current state.

30. Reviews Dashboard

Restaurant managers see:

Overall rating: 4.6

Chicken Sekuwa
⭐ 4.8
238 reviews

Momo
⭐ 4.7
512 reviews

Chowmein
⭐ 4.1
102 reviews

Allow filtering by:

Dish

Rating

Date

Positive/negative

Restaurant replies can be a future feature.

31. Restaurant Analytics

MVP metrics:

Orders

Total orders

Orders today

Orders this week

Orders this month

Revenue

Revenue today

Revenue this week

Revenue this month

Dishes

Most ordered

Highest rated

Lowest rated

Highest reorder rate

Customer feedback

Average restaurant rating

Average dish rating

Review count

Recommendation rate

32. Important Product Metric

The most important product metric is not just orders.

Track:

Dish Decision Rate

How often does a diner open a dish detail page and then add that dish to cart?

This tells us whether ratings/reviews actually help decision-making.

Other important metrics:

QR scan → menu view

Menu view → dish detail

Dish detail → add to cart

Cart → order

Completed order → review

Review submission rate

Repeat order rate

Recommendation rate

33. Data Model

Suggested relational model:

User
Restaurant
RestaurantMember
Table
DiningSession
MenuCategory
Dish
Order
OrderItem
DishReview
DishReviewTag
DishTag

Relationships:

User
 └── RestaurantMember
       └── Restaurant
             ├── Tables
             ├── MenuCategories
             │      └── Dishes
             ├── DiningSessions
             ├── Orders
             │      └── OrderItems
             └── Reviews

34. Suggested PostgreSQL Schema Concepts

Use PostgreSQL as the source of truth.

Recommended identifiers:

UUIDs for primary keys.

Numeric/decimal for money, never floating-point.

UTC timestamps in database.

Restaurant timezone stored explicitly.

Money:

price NUMERIC(12,2)

Do not use JavaScript floating point for financial calculations.

35. Suggested API Structure

REST is sufficient for MVP.

Example:

/api/v1/public/restaurants/:restaurantSlug
/api/v1/public/restaurants/:restaurantSlug/menu
/api/v1/public/dishes/:dishId
/api/v1/public/dishes/:dishId/reviews

/api/v1/orders
/api/v1/orders/:orderId
/api/v1/orders/:orderId/status

/api/v1/restaurant/orders
/api/v1/restaurant/menu
/api/v1/restaurant/categories
/api/v1/restaurant/dishes
/api/v1/restaurant/tables
/api/v1/restaurant/reviews
/api/v1/restaurant/analytics

Keep public diner endpoints separate from authenticated restaurant management endpoints.

36. API Principles

Validate all request bodies.

Validate route parameters.

Authorize restaurant access server-side.

Never trust restaurantId supplied by the client for authorization.

Use transactions for order creation.

Ensure prices are retrieved server-side at checkout.

Prevent ordering unavailable dishes.

Prevent reviewing dishes not present in eligible completed orders.

Add idempotency for order creation to prevent duplicate orders from retries.

37. Order Creation Transaction

Order creation should be transactional.

Conceptually:

BEGIN

Validate dining session
Validate restaurant
Validate table
Validate all dishes
Validate availability
Load current prices
Calculate subtotal
Calculate taxes/fees
Create order
Create order items

COMMIT

Do not trust client-calculated totals.

38. Real-Time Order Updates

MVP can use polling.

Future preferred approach:

Restaurant Dashboard
        ↓
Order event
        ↓
Event bus / WebSocket
        ↓
Diner

Potential event names:

order.created
order.accepted
order.preparing
order.ready
order.completed
order.cancelled

Given a microservice architecture, keep domain events in mind but do not introduce Kafka/NATS solely for MVP unless required by scale.

39. Notifications

MVP:

In-app order status.

Future:

Browser notifications

SMS

WhatsApp

Push notifications

Restaurant staff alerts

Do not build all notification channels initially.

40. Payments

MVP recommendation:

Support:

Pay at restaurant

Optionally:

Cash

Card handled by restaurant

Future:

Online payment

Wallets

QR payments

Split payment

Keep payment architecture extensible without making payment integration a blocker for the MVP.

41. Pricing and Fees

Order totals should support:

subtotal
tax
serviceCharge
discount
total

Restaurant-level configuration can eventually determine:

Tax rules

Service charge

Discounts

Do not hardcode Nepal-specific tax rules into domain logic unless the initial deployment requires it.

42. Recommended Architecture

For a first production version:

                 ┌───────────────┐
                 │ Customer PWA  │
                 └───────┬───────┘
                         │
                 ┌───────▼───────┐
                 │ API / Backend │
                 └───────┬───────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
      ┌─────▼────┐ ┌────▼─────┐ ┌───▼──────┐
      │PostgreSQL│ │   Redis  │ │   S3/CDN │
      └──────────┘ └──────────┘ └──────────┘
                         ▲
                         │
                 ┌───────┴───────┐
                 │ Restaurant Web│
                 │    Dashboard  │
                 └───────────────┘

Recommended approach:

React + TypeScript frontend

Node.js + TypeScript backend

PostgreSQL

Prisma or equivalent ORM

Redis only when needed for caching/session/rate limiting

Object storage for images

CDN for public images

Do not split into many microservices prematurely.

A modular monolith is appropriate for MVP.

43. Backend Modules

Organize backend by domain:

src/
  modules/
    restaurants/
    tables/
    menus/
    dishes/
    dining-sessions/
    orders/
    reviews/
    analytics/
    users/
    auth/

Avoid organizing the entire application only by technical layer such as:

controllers/
services/
repositories/
models/

Domain modules make future extraction into services easier.

44. Frontend Structure

Customer application:

restaurant/
  menu
  category
  dish
  cart
  checkout
  order-status
  review

Restaurant dashboard:

dashboard
orders
menu
categories
dishes
tables
reviews
analytics
settings

Shared components:

DishCard
RatingStars
RatingBreakdown
ReviewCard
Price
QuantitySelector
CartItem
OrderStatus

45. Design Principles

The customer interface should feel:

Fast

Visual

Food-focused

Simple

Mobile-first

Low-friction

Do not make it look like an enterprise ERP.

The diner should be able to answer within seconds:

What should I order?

46. Important UX Rules

Rule 1: Ratings must be visible immediately

Do not hide ratings behind another screen.

Rule 2: Price must remain prominent

Ratings should enhance the menu, not obscure prices.

Rule 3: Photos matter

Food is visual. Dish imagery should be prominent where available.

Rule 4: Avoid rating overload

Do not show 20 metrics on every card.

Use progressive disclosure.

Rule 5: Make ordering persistent

Cart should remain accessible while browsing.

47. Empty States

If a dish has no ratings:

Do not show:

⭐ 0

Instead:

Be the first to rate this dish

If a restaurant has no reviews:

No diner ratings yet

Do not manufacture ratings.

48. Rating Confidence

Avoid presenting:

5.0 ⭐

from a single rating as equivalent to:

4.8 ⭐ · 500 ratings

UI should always show the rating count.

Future versions can implement Bayesian/Wilson score ranking so restaurants cannot dominate rankings from tiny sample sizes.

49. Dish Ranking

Do not simply sort dishes by raw average rating.

Bad:

Dish A: 5.0, 2 ratings
Dish B: 4.8, 500 ratings

Dish A should not automatically rank above Dish B.

Use a ranking function incorporating:

Rating

Rating count

Order volume

Recent trend

Recommendation rate

For MVP, use a simple weighted score and make the formula replaceable.

50. Restaurant Owner Permissions

Restaurant roles:

OWNER

Full access.

MANAGER

Menu, tables, orders, reviews, analytics.

STAFF

Orders only.

Use RBAC.

Future requirements may justify more granular permissions.

51. Audit Logging

For restaurant management actions, consider logging:

Price changes

Dish availability changes

Dish deletion/archive

Menu changes

Order status changes

MVP can use a simple audit log table.

52. Security

Requirements:

Authentication for restaurant staff.

Password hashing through a proven authentication solution.

Secure session/token handling.

Authorization on every protected endpoint.

Rate limiting.

Input validation.

SQL injection protection through ORM/parameterization.

XSS protection.

CSRF protection where applicable.

Secure image upload validation.

Do not expose internal IDs unnecessarily in public URLs.

Never trust client totals.

Never trust client restaurant/table ownership claims.

53. QR Security

The QR token should not expose sensitive information.

Use an opaque public token.

Example:

restaurantSlug = cafe-central
tableToken = x7Hk92...

Do not use sequential IDs as public QR tokens.

54. Image Handling

Restaurant managers upload dish images.

Recommended flow:

Dashboard
   ↓
Request upload URL
   ↓
Upload directly to object storage
   ↓
Confirm upload
   ↓
Save image metadata

Do not send large images through the main API if direct object storage upload is available.

55. Review Moderation

Review states:

PUBLISHED
HIDDEN
FLAGGED

MVP:

Restaurant can flag.

Platform admin can hide.

Diner can report.

Do not allow restaurants to directly delete negative reviews.

This is critical for maintaining trust.

56. Privacy

Do not expose:

Diner phone numbers

Email

Internal order IDs

Payment information

Private account data

Public reviews should show only safe information such as:

Verified diner

Optionally later:

Anonymous diner

or a chosen display name.

57. MVP Rollout Strategy

Do not launch with hundreds of restaurants.

Pilot with:

1-3 restaurants.

Focus on restaurants where:

Menu is relatively stable.

Customers dine in.

Dish variety is meaningful.

Staff are willing to use a digital order system.

Customer feedback is valuable.

Run the system manually if necessary during the first pilot.

58. MVP Success Criteria

The MVP is successful if:

A customer can scan a QR and immediately understand the restaurant menu.

Customers can identify highly rated dishes.

Customers can place an order without staff assistance.

Restaurant staff reliably receive orders.

Completed orders generate verified review opportunities.

Dish ratings become useful enough that customers use them to choose food.

Restaurant owners find the feedback useful.

59. Phase 2

After MVP validation:

Customer

Accounts

Order history

Favorites

Personalized recommendations

Reorder

Better search

Dietary preferences

Restaurant

Restaurant replies

Advanced analytics

Promotions

Featured dishes

Customer insights

Platform

Restaurant discovery

Public restaurant pages

Search across restaurants

60. Phase 3

Potential differentiators:

Social Food Graph

Users can see what friends liked.

Personalized Recommendations

User preferences
+
Previous orders
+
Dish ratings
+
Restaurant context
=
Recommendation

AI Food Assistant

Example:

"I'm hungry, I want something spicy under Rs. 500, and I don't want momo."

Assistant:

"Try the Chicken Sekuwa. It is rated 4.8 by 238 diners and 89% would order it again."

AI should sit on top of reliable structured data, not replace it.

61. Future Recommendation Engine

Potential input signals:

User
 ├── Previous orders
 ├── Ratings
 ├── Reorder behavior
 ├── Price preference
 ├── Dietary preferences
 └── Favorite cuisines

Restaurant
 ├── Menu
 ├── Dish ratings
 ├── Popularity
 ├── Recent trends
 └── Price

Context
 ├── Time
 ├── Meal type
 ├── Group size
 └── Table/session

Output:

Recommended dishes

62. Potential Signature Features

These should be considered after the core system works:

"Would Order Again"

Simple and highly meaningful.

"Most Loved Here"

Restaurant-specific ranking.

"Hidden Gem"

High satisfaction + low exposure.

"People Usually Order This With..."

Dish pairing recommendations.

Example:

People who ordered Chicken Sekuwa often ordered Aloo Sadeko.

"Best Value"

High rating relative to price.

"Trending Today"

Recent order momentum.

"Your Table's Favorites"

Interesting future feature for group dining.

63. Dish Pairing Engine

Once order data grows:

Chicken Sekuwa
    ↓
Frequently co-ordered
    ↓
Aloo Sadeko
    ↓
Suggest:
"Pairs well with Aloo Sadeko"

This can increase average order value without aggressive advertising.

64. Business Model

Potential models:

SaaS

Restaurant pays monthly.

Example tiers:

Basic
Digital menu + QR

Standard
Menu + ordering + reviews

Premium
Ordering + reviews + analytics + recommendations

Transaction Fee

Small fee per order.

Hybrid

Subscription + small transaction fee.

Start with the simplest model that makes restaurant adoption easy.

65. Product Moat

The ordering interface is not the moat.

The long-term moat is:

Verified dish-level behavioral data.

Potential dataset:

Restaurant
Dish
Price
Order count
Rating
Review
Taste rating
Portion rating
Value rating
Would-order-again
Timestamp
Co-ordered dishes

Over time this becomes increasingly valuable for:

Recommendations

Restaurant analytics

Dish ranking

Demand prediction

Menu optimization

66. Critical Product Risks

Risk 1: No reviews

New restaurants/dishes have insufficient data.

Solution:

Show "Not enough ratings yet."

Encourage post-order reviews.

Never fake ratings.

Risk 2: Fake reviews

Solution:

Completed-order verification.

Risk 3: Restaurant adoption

Solution:

Make QR menu + ordering useful even before reviews accumulate.

Risk 4: Customer friction

Solution:

No mandatory app installation.

No mandatory account for basic dining.

Risk 5: Restaurants manipulate ratings

Solution:

Verified reviews.

Transparent methodology.

Do not allow restaurants to edit ratings.

Risk 6: Menu data becomes outdated

Solution:

Restaurant dashboard with availability toggles.

Menu management designed for quick updates.

67. Coding Agent Instructions

When implementing this project:

Treat this document as the product baseline.

Do not implement future-phase features unless explicitly requested.

Prefer a modular monolith for MVP.

Keep domain boundaries clean.

Use TypeScript end-to-end where practical.

Use PostgreSQL as the transactional source of truth.

Use UUIDs.

Store money using decimal/numeric types.

Store timestamps in UTC.

Keep restaurant timezone explicitly.

Validate input at API boundaries.

Enforce authorization server-side.

Use database transactions for order creation.

Never trust client-provided prices or totals.

Never allow reviews without an eligible completed purchase.

Preserve historical order item names and prices.

Prefer archive/deactivation over deleting historical menu entities.

Keep business rules in domain/application services rather than UI.

Write tests for critical order and review rules.

Avoid premature microservices and infrastructure complexity.

68. Suggested Implementation Order

Phase A: Foundation

Project setup

Database

Authentication

Restaurant model

Restaurant member roles

Phase B: Restaurant Configuration

Restaurant profile

Categories

Dishes

Images

Tables

QR generation

Phase C: Customer Experience

QR entry

Restaurant menu

Categories

Dish cards

Dish detail

Search

Cart

Phase D: Ordering

Dining session

Order creation

Order items

Order status

Restaurant order dashboard

Phase E: Reviews

Review eligibility

Rating submission

Review display

Rating aggregation

Recommendation percentage

Phase F: Analytics

Order metrics

Dish metrics

Rating metrics

Basic dashboard

Phase G: Hardening

Authorization

Rate limits

Idempotency

Error handling

Audit logging

Tests

Monitoring

69. Critical Acceptance Tests

QR

Given a valid table QR:

Correct restaurant opens.

Correct table is associated with session.

Invalid/disabled table is rejected appropriately.

Menu

Available dishes appear.

Unavailable dishes cannot be ordered.

Categories are correctly ordered.

Prices are current.

Order

Customer can add multiple dishes.

Quantities work.

Server recalculates total.

Historical price is stored.

Duplicate order submission is prevented.

Restaurant receives order.

Order status changes are persisted.

Review

Completed purchaser can review.

Non-purchaser cannot review.

Uncompleted order cannot review.

Same dish/order cannot be reviewed twice.

Rating aggregation updates correctly.

Permissions

Staff cannot modify owner-only settings.

Restaurant A cannot access Restaurant B data.

Public endpoints expose only intended data.

70. Example End-to-End Scenario

Customer sits at Table 12.

Step 1

Scans QR.

Step 2

System creates/resumes dining session.

Step 3

Customer sees:

Restaurant X
⭐ 4.6

🔥 Most Loved

Chicken Sekuwa
⭐ 4.8 · 238 ratings
Rs. 450

Momo
⭐ 4.7 · 512 ratings
Rs. 280

Step 4

Customer opens Chicken Sekuwa.

Sees:

⭐ 4.8
238 verified ratings

89% would order again

Taste: 4.8
Portion: 4.4
Value: 4.5

"Smoky and juicy."

Step 5

Adds it to cart.

Step 6

Places order.

Step 7

Restaurant receives:

Table 12
2 × Chicken Sekuwa
1 × Momo

Step 8

Restaurant marks:

Accepted → Preparing → Ready → Completed

Step 9

Customer receives:

How was your meal?

Chicken Sekuwa
★★★★★

Momo
★★★★☆

Would you order Chicken Sekuwa again?
[ Yes ] [ No ]

Step 10

Review becomes part of the dish's verified rating data.

71. North Star

The product should continuously answer one question better than a traditional menu:

"What should I order here?"

Everything in the MVP should support that question.

Ordering is important because it creates a seamless dining experience and, more importantly, creates a trusted feedback loop.

The long-term loop is:

Discover
   ↓
Choose
   ↓
Order
   ↓
Eat
   ↓
Rate
   ↓
Learn
   ↓
Recommend
   ↓
Discover

That loop is the heart of the product.