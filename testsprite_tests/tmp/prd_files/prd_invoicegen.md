# Product Requirement Document (PRD): InvoiceGen

## 1. Executive Summary
**InvoiceGen** is a professional-grade, dark-themed invoice generation tool designed for freelancers and small businesses. It provides a seamless, real-time editing experience with live PDF previews and automated cloud synchronization. Built with a focus on aesthetics and efficiency, it streamlines the billing process by allowing users to manage, generate, and store invoices securely.

---

## 2. Product Objectives
- **Aesthetic Excellence**: Deliver a premium, modern UI using glassmorphism and smooth animations.
- **Real-Time Feedback**: Provide an instant "What You See Is What You Get" (WYSIWYG) preview of the invoice.
- **Cloud Persistence**: Securely save every generated invoice and its corresponding PDF to the cloud for historical access.
- **Frictionless Export**: Enable one-click professional PDF generation optimized for A4 printing.

---

## 3. Target Audience
- **Freelancers**: Designers, developers, and writers needing quick professional billing.
- **Small Business Owners**: Users requiring a consistent and modern invoice format.
- **Independent Contractors**: Individuals looking for an easy way to track and generate payment requests.

---

## 4. Functional Requirements

### 4.1. User Authentication
| ID | Feature | Description |
| :--- | :--- | :--- |
| **F-01** | Secure Sign In | Users can log in via Email/Password or Google OAuth. |
| **F-02** | Registration | New users can create an account with email verification. |
| **F-03** | Persistent Session | Users remain logged in across sessions using Supabase Auth. |
| **F-04** | Auth-Gated App | The invoice editor is only accessible to authenticated users. |

### 4.2. Invoice Editor (Panel)
| ID | Feature | Description |
| :--- | :--- | :--- |
| **F-05** | Identity Fields | Manual entry for Invoice Number and Date (Current date auto-filled). |
| **F-06** | Party Management | Multi-line text areas for "From" (Sender) and "To" (Client) details. |
| **F-07** | Project Context | Subject line and detailed project description fields. |
| **F-08** | Dynamic Line Items | Users can add/remove line items. Each item includes a description and an amount (INR/₹). |
| **F-09** | Automatic Totals | The system calculates the total amount payable in real-time. |
| **F-10** | Payment Info | Structured fields for Bank Details, UPI ID, IFSC, PAN, Email, and Phone. |
| **F-11** | Signatory | Customizable signature name and closing message. |

### 4.3. Live Preview & PDF Generation
| ID | Feature | Description |
| :--- | :--- | :--- |
| **F-12** | Live WYSIWYG | The right panel displays a pixel-perfect preview that syncs as the user types. |
| **F-13** | PDF Export | High-quality A4 PDF generation using `html2pdf.js`. |
| **F-14** | Responsive Layout | Mobile-optimized view with dedicated generation buttons. |

### 4.4. Backend & Cloud Features (Supabase)
| ID | Feature | Description |
| :--- | :--- | :--- |
| **F-15** | Data Sync | All invoice metadata and line items are saved to PostgreSQL upon generation. |
| **F-16** | PDF Storage | Generated PDF blobs are uploaded to Supabase Storage, organized by User ID. |
| **F-17** | Data Privacy | Row Level Security (RLS) ensures users can only access their own invoices. |

---

## 5. Technical Stack

### Frontend
- **HTML5/CSS3**: Core structure and glassmorphism design.
- **JavaScript (Vanilla)**: State management, DOM manipulation, and logic.
- **Remix Icons**: Unified, modern iconography.
- **Google Fonts**: Inter (UI) and JetBrains Mono (Invoice Text).

### PDF Engine
- **html2pdf.js**: Wrapper for **html2canvas** and **jsPDF**, ensuring high fidelity during export.

### Backend (Supabase)
- **Auth**: Email/Password and Google OAuth.
- **PostgreSQL**: Relational storage for invoices and items.
- **Storage**: S3-compatible bucket for PDF file hosting.

---

## 6. User Interface & Experience (UI/UX)
- **Design Language**: Glassmorphism (semi-transparent panels), vibrant gradients, and deep charcoal backgrounds.
- **Animations**: Staggered entry animations for UI elements; smooth transitions for dynamic row removals.
- **Layout**: Split-screen layout for desktop; vertical stacking for mobile devices.

---

## 7. Data Architecture (Inferred)

### `invoices` Table
- `id` (UUID, PK)
- `user_id` (UUID, FK)
- `invoice_number` (String)
- `invoice_date` (String/Date)
- `from_party` (Text)
- `to_party` (Text)
- `subject` (String)
- `description` (Text)
- `total_amount` (Numeric)
- `pdf_url` (URL)
- `created_at` (Timestamp)

### `invoice_items` Table
- `id` (BigInt, PK)
- `invoice_id` (UUID, FK)
- `description` (String)
- `amount` (Numeric)
- `sort_order` (Integer)

---

## 8. Success Metrics
- **Performance**: PDF generation and cloud save completed in < 3 seconds.
- **Accuracy**: 100% parity between Live Preview and the generated PDF.
- **Accessibility**: Support for all modern browsers and major mobile screen sizes.
