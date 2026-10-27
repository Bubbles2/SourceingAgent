Parisien Sourcing Agent — Project Summary

## 1. Project Overview

Parisien Sourcing Agent is a modern, responsive web application that enables international customers and businesses to participate in Parisien auctions through a Paris-based sourcing agent.

Customers can discover upcoming auctions, access PDF catalogues, and submit requests for the agent to bid on specific auction lots on their behalf.

The application does not conduct live auctions. It manages bidding requests that are subsequently reviewed and executed by the sourcing agent.

## 2. Core Features

### Landing Page
- Modern, elegant design inspired by Parisien auction houses.
- Professional blue, navy, ivory, and gold colour scheme.
- Hero section explaining the service.
- Featured upcoming auctions.
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
- View auction descriptions, dates, locations, and auction houses.
- Access associated catalogues.
- Administrators can create, edit, and manage auctions.

### Catalogues
- Browse auction catalogues.
- Each catalogue links to an existing external PDF.
- View catalogue details and associated auctions.
- Administrators can create, edit, and delete catalogue entries.
- No PDF processing or extraction is required.

### Bid Requests
- Registered customers can request bids on specific auction lots.
- Select an auction and catalogue from dropdown lists.
- Enter the lot number and maximum bid amount in EUR.
- Optionally provide additional instructions.
- Display a mandatory notice explaining that maximum bids exclude auctioneer fees, taxes, agent fees, shipping, and transport.
- Requests are submitted for administrator approval.

### Requested Lots
- Public page displaying auction lots with accepted bidding requests.
- Show auction, catalogue, lot number, and availability status.
- Prevent conflicting accepted requests for the same lot.
- Never disclose customer identities or maximum bid amounts.

### My Requests
- Customers can view their submitted bidding requests.
- Display auction, lot number, maximum bid, and request status.
- Support statuses including Pending Review, Accepted, Rejected, Cancelled, Bid Placed, Won, and Lost.

### Auction Calendar
- Outlook-style monthly calendar.
- Display upcoming auctions on their scheduled dates.
- Navigate between months.
- Select an auction to view its description and catalogue.
- Administrators can create and edit auctions directly from the calendar.

### Administration Dashboard
- Manage customers, auctions, and catalogues.
- Review, accept, or reject bidding requests.
- Update bidding outcomes.
- View upcoming auctions and pending requests.
- Maintain an audit history of important status changes.

## 3. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| Backend | Node.js + Express |
| Database | Local PostgreSQL |
| ORM | Prisma or equivalent |
| Validation | Zod |
| Authentication | Secure cookie-based sessions |
| Calendar | FullCalendar or equivalent |

## 4. Database

PostgreSQL stores the application's persistent data.

Main tables:

- **Users:** Customer accounts and authentication.
- **Auctions:** Auction details, dates, and locations.
- **Catalogues:** Catalogue information and external PDF links.
- **Bid Requests:** Customer requests, lot numbers, maximum bids, and statuses.
- **Request Status History:** Audit trail of bidding request changes.

Use foreign keys, appropriate indexes, and database constraints to maintain data integrity and prevent conflicting accepted requests.

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
Connect the frontend to the backend and implement catalogue browsing, bidding requests, and customer dashboards.

### Phase 4 — Administration
Implement auction management, catalogue management, request approvals, and administrative reporting.

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
8. Only administrators can manage auctions, catalogues, and request approvals.
9. Auction catalogues are external PDF links.
10. All persistent application data is stored in PostgreSQL.

## 9. Project Objective

Deliver a secure, attractive, and easy-to-use platform that simplifies access to Parisien auctions for international buyers.

The initial priority is a polished React interface demonstrating the complete customer journey, followed by integration with a Node.js/Express backend and local PostgreSQL database.

Keep the implementation simple, modular, maintainable, and suitable for future expansion.

You can paste this directly into your `spec.md` file. It provides a condensed project specification covering the functionality, architecture, database, security, and development phases.