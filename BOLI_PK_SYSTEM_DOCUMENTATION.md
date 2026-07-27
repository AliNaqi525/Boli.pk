# Boli.pk — Complete Technical & System Architecture Documentation

> **Project Name:** Boli.pk  
> **Repository:** [https://github.com/AliNaqi525/Boli.pk](https://github.com/AliNaqi525/Boli.pk)  
> **Target Platform:** Real-Time Escrow Auction & Bidding Marketplace for Pakistan  
> **Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Supabase (PostgreSQL, Auth, Service Role API), Socket.io (WebSockets), Tailwind CSS v4  

---

## 1. Executive Summary & Core Concept

**Boli.pk** is a full-stack, real-time online auction and digital escrow platform tailored specifically for the Pakistani market. It resolves the classic e-commerce trust deficit in online auctions through a **Two-Tier Escrow Financial Model**:

1. **Buyer Protection:** When a buyer places a bid, their funds are locked in a digital escrow ledger. The seller does not receive any money upfront.
2. **Delivery Confirmation & Escrow Release:** Once the auction finishes and the parcel is delivered, the winning buyer clicks **"Satisfied with Delivery"**. This transactionally transfers **96% of the winning bid** to the seller's wallet and automatically deposits a **4% platform service fee** into the admin's wallet.
3. **Seller Phone Reveal (Winners Only):** To preserve auction privacy and prevent off-platform bypass, seller contact details (name and phone number) are strictly hidden during live bidding and revealed **only to the verified winning buyer**.

---

## 2. Technology Stack & System Architecture

### Frontend & UI Layer
* **Framework:** Next.js 16 (App Router with Client & Server Components)
* **Styling System:** Vanilla CSS + Tailwind CSS v4 with custom Electric Lime design tokens (`lime-500`, `#f2f6f1` light mode background, `#080d08` dark obsidian mode background).
* **Theme Synchronization:** Flawless pre-hydration inline script in `app/layout.tsx` that syncs `.dark` class across both `<html>` and `<body>` to eliminate theme flashing.
* **Typography:** Google Inter font via `next/font/google`.

### Real-Time WebSocket Infrastructure
* **Socket Server ([server.js](file:///d:/OneDrive%20-%20PERSEUS%20MANAGEMENT%20GROUP%20INC/Project/Contour%20Project/Programs/boli-pk/server.js)):** Custom Node.js Express server integrated with Socket.io (`io`).
* **Socket Rooms:** Buyers automatically join item-specific rooms (`joinRoom`, `leaveRoom`).
* **Live Broadcast:** When a new highest bid is accepted, the server broadcasts `bidUpdated` event to all connected clients in real-time without requiring a page refresh.

### Database & Security Layer
* **Database Engine:** Supabase PostgreSQL with Row Level Security (RLS) policies.
* **Authentication:** Supabase Auth Phone OTP SMS system with role metadata checking.
* **Admin Privilege Execution:** Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) used exclusively in Next.js Server API Routes to perform atomic wallet deductions, escrow releases, and multi-table profile syncs.

---

## 3. Database Schema & Data Models

### 1. `users` Table
Stores registered buyer and seller profile information.
* `u_id` *(UUID, Primary Key)* — Maps to Supabase Auth User ID.
* `phone_number` *(VARCHAR)* — User's registered phone number.
* `full_name` *(VARCHAR)* — Display name.
* `cnic_verified` *(BOOLEAN)* — Identity verification status flag.

### 2. `items` Table
Stores auction product listings.
* `i_id` *(UUID, Primary Key)* — Unique item identifier.
* `seller_id` *(UUID, Foreign Key -> users.u_id)* — Seller user ID.
* `title` *(VARCHAR)* — Product title. Supports embedded image tags (`[img:URL]`) for permanent cross-device photo persistence.
* `starting_price` *(NUMERIC)* — Base starting bid in PKR.
* `auction_end_time` *(TIMESTAMPTZ)* — Expiration date and time for bidding.
* `status` *(VARCHAR)* — Status state (`'active'`, `'completed'`, `'settled'`, `'cancelled'`).

### 3. `bids` Table
Tracks bidding offers and escrow locking states.
* `b_id` *(UUID, Primary Key)* — Unique bid record ID.
* `item_id` *(UUID, Foreign Key -> items.i_id)* — Target auction product ID.
* `bidder_id` *(UUID, Foreign Key -> users.u_id)* — Buyer user ID.
* `bid_amount` *(NUMERIC)* — Bid value in PKR.
* `escrow_status` *(VARCHAR)* — Escrow state (`'locked'`, `'released'`, `'refunded'`).

### 4. `wallets` Table
Manages user balances and locked escrow funds.
* `w_id` *(UUID, Primary Key)* — Unique wallet ID.
* `user_id` *(UUID, Foreign Key -> users.u_id)* — Wallet owner ID.
* `balance` *(NUMERIC)* — Available funds in PKR.
* `locked_funds` *(NUMERIC)* — Escrow locked funds currently committed to active leading bids.

---

## 4. Financial Rules & Transaction Mechanics

### A. Consecutive Bidding Block
* **Rule:** A buyer who currently holds the highest bid on an auction **cannot** place consecutive bids until another buyer outbids them.
* **Implementation ([app/api/bids/place/route.js](file:///d:/OneDrive%20-%20PERSEUS%20MANAGEMENT%20GROUP%20INC/Project/Contour%20Project/Programs/boli-pk/app/api/bids/place/route.js)):** Checks `highestBid.bidder_id === userId`. If true, returns `403 Forbidden` with notice *"You currently hold the leading bid! Waiting for another buyer to bid before you can bid again."*
* **UI Feedback ([app/auction/page.js](file:///d:/OneDrive%20-%20PERSEUS%20MANAGEMENT%20GROUP%20INC/Project/Contour%20Project/Programs/boli-pk/app/auction/page.js)):** Disables quick increment buttons and bid submission form while displaying a golden status banner.

### B. 4% Admin Commission & Seller Settlement
* **Rule:** Upon buyer delivery confirmation, the platform deducts a 4% service fee.
* **Calculations ([confirm-delivery/route.js](file:///d:/OneDrive%20-%20PERSEUS%20MANAGEMENT%20GROUP%20INC/Project/Contour%20Project/Programs/boli-pk/app/api/wins/confirm-delivery/route.js)):**
  $$\text{Admin Fee (4\%)} = \text{Math.round}(\text{Winning Bid} \times 0.04 \times 100) / 100$$
  $$\text{Seller Payout (96\%)} = \text{Winning Bid} - \text{Admin Fee}$$
* **Atomic Execution:**
  1. Deduct `Winning Bid` from Buyer's `balance` & `locked_funds`.
  2. Credit `Seller Payout` to Seller's wallet `balance`.
  3. Credit `Admin Fee` to Admin's wallet `balance` (phone number `+920000000000` / `+923334339291`).
  4. Update `bids.escrow_status` to `'released'` and `items.status` to `'completed'`.

---

## 5. Key Application Routes & Pages

| Route | Type | Description |
| :--- | :--- | :--- |
| **`/`** | Client Page | Phone OTP authentication & registration portal with dark/light mode toggle. |
| **`/auction`** | Client Page | Real-time live bidding floor. Features category filter pills, WebSocket live tickers, quick increment buttons, and full-screen image lightbox zoom. |
| **`/seller`** | Client Page | Product listing portal. Features 4% fee notice, file upload (base64 converter), web URL link input, preset image buttons, and live image preview. |
| **`/wins`** | Client Page | Won Items & Deliveries manager for buyers. Features **"Satisfied with Delivery"** escrow release button and **"Show Seller Phone"** toggle button. |
| **`/wallet`** | Client Page | Escrow Wallet balance overview & Instant Top-Up simulator. |
| **`/admin`** | Client Page | Executive Admin Portal. Features platform metrics, total escrow breakdown, user management, and manual escrow settlement override controls. |

---

## 6. API Reference Summary

### `POST /api/bids/place`
* **Body:** `{ userId, itemId, bidAmount }`
* **Validation:** Checks user wallet balance, verifies bid > current highest bid, blocks consecutive bids by leading bidder.
* **Effect:** Locks funds in buyer wallet, records bid with `escrow_status: 'locked'`, triggers WebSocket `bidUpdated` broadcast.

### `POST /api/wins/confirm-delivery`
* **Body:** `{ userId, itemId }`
* **Validation:** Verifies caller is the winning buyer and escrow has not been previously released.
* **Effect:** Performs atomic transfer (96% seller payout, 4% admin fee deposit), sets `escrow_status: 'released'`, sets `items.status: 'completed'`.

### `POST /api/items`
* **Body:** `{ sellerId, title, startingPrice, auctionEndTime, imageUrl }`
* **Feature:** Embeds `[img:URL]` into item title to guarantee cross-device image persistence even without database schema modifications.

---

## 7. Instructions for Gemini Pro Analysis

When feeding this project to **Gemini Pro**:
1. Copy this document (`BOLI_PK_SYSTEM_DOCUMENTATION.md`) along with `package.json` into the context window.
2. Prompts you can ask Gemini Pro:
   - *"Explain the escrow transaction lifecycle in Boli.pk step-by-step from bid placement to buyer delivery confirmation."*
   - *"Summarize the security controls preventing fraudulent consecutive bidding and off-platform seller contact leaks."*
   - *"Analyze the database design and API route structure of Boli.pk for an technical internship presentation."*

---

*Documentation generated for Boli.pk MVP deployment (Contour Software Internship).*
