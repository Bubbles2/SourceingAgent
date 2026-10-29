# French Sourcing Agent — Project Summary

## 1. Project Overview

French Sourcing Agent is a modern, responsive web application that enables international customers and businesses to participate in French auctions through a Paris-based sourcing agent.

Customers can discover upcoming auctions, browse the lots in each sale, and submit requests for the agent to bid on specific lots on their behalf.

The application does not conduct live auctions. It manages bidding requests that are subsequently reviewed and executed by the sourcing agent.

Auctions and their lots come from the auction monitor, a separate collector that gathers sales and lots from French auction websites such as drouot.com. The application reads this data; it does not create or edit auctions or lots.

## 2. Core Features

### Landing Page
- Modern, elegant design inspired by French auction houses.
- Professional blue, navy, ivory, and gold colour scheme.
- Hero section explaining the service.
- The next upcoming auctions.
- Simple explanation of how the service works.
- Responsive design for desktop, tablet, and mobile.
- Use provided reference images to guide the visual design.

### User Authentication
- Customer registration and sign-in.
- Secure password management.
- Customer account management.
- Role-based access for visitors, customers, and administrators.

### Auctions
- Browse upcoming and completed auctions.
- View each auction's title, date, sale time (Paris time), location, and number of lots.
- Link to the auction's catalogue on the source website.
- View the lots in each auction.
- Auctions are read-only; they come from the auction monitor.

### Lots
- Browse lots from upcoming or completed sales, or the lots of a single auction.
- Each lot shows its number, photo, title, description, category, maker, and estimate, with a link to the lot on the source website.
- Show the English title and description when the auction monitor provides a translation, otherwise the original text.
- Lots in upcoming sales link to the bid request form with the auction and lot already chosen.
- Lots are read-only; they come from the auction monitor. There are no PDF catalogues to process.

### Bid Requests
- Registered customers can request bids on specific auction lots.
- Select an upcoming auction, then the lot from a list of that auction's lots.
- Enter the maximum bid amount in EUR.
- Optionally provide additional instructions.
- Display a mandatory notice explaining that maximum bids exclude auctioneer fees, taxes, agent fees, shipping, and transport.
- Requests are submitted for administrator approval.
- A customer cannot request the same lot again while an earlier request for it is still open.

### Requested Lots
- Public page displaying auction lots with accepted bidding requests.
- Show the auction, the lot (number and title), and availability status.
- Prevent conflicting accepted requests for the same lot.
- Never disclose customer identities or maximum bid amounts.

### My Requests
- Customers can view their submitted bidding requests.
- Display the auction, the lot (number and title), maximum bid, and request status.
- Support statuses including Pending Review, Accepted, Rejected, Cancelled, Bid Placed, Won, and Lost.

### Auction Calendar
- Outlook-style monthly calendar.
- Display upcoming auctions on their scheduled dates.
- Navigate between months.
- Select an auction to view its details, number of lots, and catalogue link.

### Administration Dashboard
- Manage customers.
- Review, accept, or reject bidding requests, and filter them by auction.
- Update bidding outcomes.
- View counts of upcoming and completed auctions, lots in upcoming sales, and requests by status.
- Maintain an audit history of important status changes.

## 3. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React + TypeScript |
| Build Tool | Vite |
| Styling | Plain CSS, a stylesheet beside each component |
| Icons | Lucide React |
| Routing | React Router, with route loaders for data |
| Backend | Node.js 24.7+ + Express, in TypeScript |
| Database | Local PostgreSQL |
| Database Access | `pg` with parameterized SQL queries (no ORM) |
| Migrations | node-pg-migrate, with SQL migration files |
| Validation | Zod, on the server |
| Authentication | Secure cookie-based sessions stored in PostgreSQL; Argon2id password hashing with Node's built-in crypto |
| HTTP Security | Helmet, CORS, and API rate limiting |
| Calendar | Custom month grid and agenda (no calendar library) |
| Testing | Vitest (unit), Node's test runner (backend), Playwright (end-to-end) |

## 4. Database

PostgreSQL stores the application's persistent data.

Main tables:

- **Users:** Customer accounts and authentication.
- **Auctions:** Sales collected by the auction monitor: source and external id, title, start and end times, sale date, location, catalogue and source links, and the raw collected data.
- **Lots:** The lots in each auction: lot number, title and description with English translations, category, maker, materials, estimates and currency, image and source links, and the monitor's AI category and summary.
- **Auction Sources:** The websites the auction monitor collects from, with its collection settings.
- **Collection Runs:** A log of each collection run: when it ran, its status, and how many auctions and lots it saw.
- **Bid Requests:** Customer requests for a lot in an auction, maximum bids, and statuses.
- **Request Status History:** Audit trail of bidding request changes.

The auctions, lots, auction sources, and collection runs tables are the same as in the auction monitor's database, so collected data can be loaded without conversion. The monitor's 30-day purge function deletes sales more than 30 days old with their lots, but here it keeps any sale with bid requests. [AUCTION_MONITOR.md](AUCTION_MONITOR.md) lists every difference from the monitor's database.

Use foreign keys, appropriate indexes, and database constraints to maintain data integrity and prevent conflicting accepted requests. A bid request's lot must belong to the auction it names.

## 5. Application Architecture

Organise the application into separate frontend and backend directories.

### Frontend
- Small, reusable React components.
- Feature-based organisation.
- Separate pages, services, hooks, and shared UI components.
- Responsive and accessible design.
- Clear separation of presentation and business logic.

### Backend
- REST API built with Express.
- Separate routes, controllers, services, and database access.
- Server-side validation and authorization.
- Centralised error handling.
- Environment-based configuration.

## 6. Security Requirements

- Secure authentication and password hashing.
- Role-based access control.
- Server-side input validation.
- Protection against SQL injection, XSS, and CSRF.
- Secure session cookies.
- API rate limiting.
- Environment variables for credentials and secrets.
- Protection of customer identities and bidding information.
- Database-level enforcement of bidding-request constraints.

## 7. Development Approach

### Phase 1 — Frontend Prototype
Create the landing page and main application screens using realistic mock data.

Prioritise visual design, usability, navigation, and responsive layouts.

**Present the UI for review before implementing complex backend functionality.**

### Phase 2 — Backend
Implement the Express API, PostgreSQL database, authentication, and data management.

### Phase 3 — Customer Workflows
Connect the frontend to the backend and implement auction and lot browsing, bidding requests, and customer dashboards.

### Phase 4 — Administration
Implement request approvals, bidding outcomes, and administrative reporting. Auctions and lots are managed by the auction monitor, not in the application.

### Phase 5 — Testing
Perform functional, integration, security, accessibility, and responsive design testing.

## 8. Important Business Rules

1. The application manages bidding requests, not live auctions.
2. Only registered customers can submit bidding requests.
3. Maximum bids represent hammer prices and exclude additional charges.
4. Bidding requests require administrator approval.
5. An accepted request reserves the lot against conflicting requests.
6. Public users can see requested lots but never customer identities or bid amounts.
7. Customers can view only their own private bidding information.
8. Only administrators can review and approve bidding requests.
9. Auctions and lots come from the auction monitor and are read-only in the application, which links to each auction's catalogue and each lot's page on the source website.
10. All persistent application data is stored in PostgreSQL.

## 9. Project Objective

Deliver a secure, attractive, and easy-to-use platform that simplifies access to French auctions for international buyers.

The initial priority is a polished React interface demonstrating the complete customer journey, followed by integration with a Node.js/Express backend and local PostgreSQL database.

Keep the implementation simple, modular, maintainable, and suitable for future expansion.

You can paste this directly into your `spec.md` file. It provides a condensed project specification covering the functionality, architecture, database, security, and development phases.