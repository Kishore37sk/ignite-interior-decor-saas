# IGNITE INTERIOR DECOR — MULTI-CLIENT PROJECT MANAGEMENT SaaS

## 1. PROJECT OVERVIEW

Build a production-ready, full-function SaaS web application for:

**Brand:** Ignite Interior Decor  
**Primary owner:** Kishore  
**Owner email:** `kishore@igniteinteriordecor.com`

The application is an internal project-management and material-management platform for an interior design/construction business.

The application must help the business owner manage:

1. Multiple clients
2. Multiple interior projects
3. Project deadlines and handover dates
4. Site managers
5. Admin/material management
6. Material requests
7. Project status
8. Material requirements and costs
9. Client-specific information
10. Site-manager performance
11. Admin performance
12. Project-wise cost and progress
13. Overall business/project dashboard
14. Role-based access and privacy

The application must be designed as a scalable SaaS product so that multiple clients/projects can be handled without mixing data.

---

# 2. IMPORTANT DEVELOPMENT INSTRUCTION

Before writing application code:

1. Inspect the entire project/repository.
2. Inspect the folder:

`design_handoff_teamhub`

3. Use the design files/components/reference material inside `design_handoff_teamhub` as the primary design reference.
4. Do not blindly replace the existing design system.
5. Reuse the visual language, spacing, typography, cards, tables, navigation, components, colors, and interaction patterns wherever appropriate.
6. If the design folder contains screenshots/mockups, reproduce the intended UI as closely as practical.
7. If there are reusable components or design tokens, use them.
8. Maintain a polished modern SaaS UI suitable for a professional interior-design company.

The final product should feel like a real commercial SaaS product, not a basic CRUD dashboard.

---

# 3. RECOMMENDED TECHNOLOGY STACK

Use the existing repository stack if one is already established.

If starting from scratch, use:

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui or the existing UI system
- Responsive design
- Lucide icons or existing icon library
- Recharts or equivalent for analytics

### Backend

Use Supabase for:

- PostgreSQL database
- Authentication
- Row Level Security
- Storage if required
- Database functions where appropriate
- Realtime where useful

### Authentication

Use Supabase Auth.

Supported users:

- Owner
- Admin
- Site Manager

Do NOT implement authentication only on the frontend.

Authentication and authorization must be enforced at the database/security layer.

---

# 4. USER ROLES

There are three main roles.

## ROLE 1 — OWNER

The owner has full access.

Owner account:

`kishore@igniteinteriordecor.com`

The password supplied separately by the business owner must be configured securely using Supabase/environment secrets and MUST NOT be hard-coded into source code.

Owner permissions:

- View all clients
- View all projects
- View all project costs
- View all material costs
- View all site managers
- View all admins
- View all material requests
- Add site managers
- Remove/deactivate site managers
- Add admins
- Deactivate admins
- Assign site managers to projects
- Assign admins to material requests/projects
- View project performance
- View site-manager performance
- View admin performance
- View client details
- View project financial information
- View project deadlines
- View handover dates
- View project history
- View all material requirements
- View dashboards
- Search/filter all records
- Access all features

The owner is the highest-level user.

---

# 5. ADMIN ROLE

Admin users are created/managed by the Owner.

Admin login must use:

- Email
- Password

Admin permissions should primarily cover:

- Material requests
- Material requirements
- Procurement/material tracking
- Request status updates
- Material cost updates
- Requirement updates
- Assignment/work tracking
- Related project information required to fulfill the material request

IMPORTANT:

Admins should NOT automatically see sensitive client financial information unless the Owner explicitly authorizes that access.

Admins should see only the client/project information required for their assigned work.

---

# 6. SITE MANAGER ROLE

Site Managers are created/managed by the Owner.

Site Manager login:

- Email
- Password

Site Manager permissions:

- View assigned projects
- View assigned clients only
- Update project progress
- Update project status
- Update project milestone dates
- Update site/project notes
- Create material requests
- Update material requirements
- Track material request status
- Add project/site updates
- Upload supporting documents/photos if implemented
- View relevant material request history

Site Managers should NOT see:

- Overall company financial information
- Other Site Managers' projects unless explicitly authorized
- Admin performance information
- Other clients
- Sensitive project financial data unless Owner grants access

---

# 7. CLIENT DATA PRIVACY

Client information is sensitive.

Implement strict access control.

The Owner controls who can access client information.

Each project should support authorization such as:

- Owner → full access
- Assigned Site Manager → assigned project/client information
- Assigned Admin → only information necessary for assigned material work

Never expose all clients through a generic frontend API.

Use Supabase Row Level Security.

---

# 8. MAIN BUSINESS PROBLEM

The current business has difficulty tracking:

### Problem 1 — Clients and project deadlines

The business needs to know:

- Who is the client?
- What project do they have?
- What is the project cost?
- When did the project start?
- When should it be completed?
- What is the expected handover date?
- What is the current status?
- Who is managing the site?
- How many days remain?
- Is the project delayed?

---

### Problem 2 — Site Manager project updates

The Owner needs to know:

- What is the current project status?
- When was the last update?
- Who updated it?
- What milestone is currently active?
- Is the project on schedule?
- Is the project delayed?
- What work remains?
- What materials are needed?

---

### Problem 3 — Material management

Site Managers need to request materials.

Admins need to process those requests.

The Owner needs visibility into:

- Requested material
- Quantity
- Required date
- Project
- Client
- Requested by
- Request status
- Admin responsible
- Estimated cost
- Actual cost
- Delivery status
- Pending requirements

---

# 9. APPLICATION MODULES

Create the following major modules.

## A. Dashboard

## B. Clients

## C. Projects

## D. Site Managers

## E. Admins

## F. Material Requests

## G. Material Requirements

## H. Project Timeline

## I. Reports / Analytics

## J. Activity / Audit Logs

## K. User Management

## L. Settings

---

# 10. OWNER DASHBOARD

The Owner dashboard is the most important dashboard.

Create a premium executive dashboard.

At the top display KPI cards:

### Total Clients

Number of active clients.

### Total Projects

Total projects.

### Ongoing Projects

Projects currently in progress.

### Completed Projects

Completed projects.

### Upcoming Handovers

Projects approaching handover.

### Delayed Projects

Projects whose deadline has passed or are projected to be delayed.

### Total Project Value

Sum of project costs.

### Material Requirement Cost

Total estimated/actual material cost.

---

# 11. OWNER DASHBOARD CHARTS

Add useful analytics.

### Project Status Chart

Examples:

- Planning
- Design
- Procurement
- Execution
- Finishing
- Handover
- Completed
- On Hold
- Delayed

Use a donut/pie chart or suitable visualization.

---

### Project Timeline

Show projects across a timeline.

Example:

Project A
Start ─────────────── Handover

Project B
Start ───────────────────── Handover

Highlight overdue projects.

---

### Site Manager Performance

Show:

| Site Manager | Projects | On Time | Delayed | Material Requests | Completion |
|---|---:|---:|---:|---:|---:|

Allow clicking a Site Manager to see their projects.

---

### Admin Performance

Show:

| Admin | Requests Assigned | Pending | Processing | Completed | Avg. Completion Time |
|---|---:|---:|---:|---:|---:|

---

# 12. CLIENT MANAGEMENT

Create a Clients module.

Owner can:

- Add client
- Edit client
- View client
- Search client
- Filter client
- Archive client
- View client project history

Client fields:

```text
Client ID
Client Name
Phone
Email
Alternate Phone
Address
City
State
Country
Project Name
Project Type
Project Cost
Start Date
Expected Completion Date
Handover Date
Status
Assigned Site Manager
Notes
Created Date
Updated Date
```

Do not duplicate client data unnecessarily if one client can have multiple projects.

Use a proper relationship:

Client → Projects

---

# 13. PROJECT MANAGEMENT

A client can have one or more projects.

Project fields:

```text
Project ID
Client ID
Project Name
Project Code
Project Type
Project Cost
Start Date
Expected Completion Date
Handover Date
Actual Handover Date
Current Status
Progress Percentage
Assigned Site Manager
Priority
Notes
Created At
Updated At
```

---

# 14. PROJECT STATUS

Support statuses such as:

```text
Planning
Design
Approval
Procurement
Execution
Finishing
Handover Pending
Completed
On Hold
Delayed
Cancelled
```

The Owner can configure statuses if appropriate.

---

# 15. PROJECT PROGRESS

Site Manager should be able to update:

```text
Progress %
Current Status
Update Date
Expected Completion Date
Current Milestone
Notes
Issues
Next Action
```

Every update must create an activity/history record.

Example:

```text
Project: Kumar Residence
Updated By: Site Manager
Date: 08 Oct 2026
Progress: 72%
Status: Finishing
Note: False ceiling completed in living room.
```

Do not overwrite history.

Maintain a project update timeline.

---

# 16. PROJECT DEADLINE MANAGEMENT

The system must automatically calculate:

### Days Remaining

Example:

`12 days remaining`

### Overdue

Example:

`5 days overdue`

### On Track

Example:

`On track`

### Handover

Display:

`Handover: 24 Oct 2026`

Use visual status indicators.

Upcoming deadline examples:

- Due in 30 days
- Due in 14 days
- Due in 7 days
- Due tomorrow
- Overdue

---

# 17. SITE MANAGER MANAGEMENT

Owner can:

- Add Site Manager
- Edit Site Manager
- Activate Site Manager
- Deactivate Site Manager
- Assign Site Manager to projects
- Remove project assignment
- View Site Manager performance
- View Site Manager activity

Site Manager fields:

```text
Name
Email
Phone
Employee ID
Role
Status
Joining Date
Assigned Projects
Created At
```

IMPORTANT:

Removing/deactivating a Site Manager must NOT delete historical records.

Use soft deletion/deactivation.

Historical project updates must remain available.

---

# 18. ADMIN MANAGEMENT

Owner can:

- Add Admin
- Edit Admin
- Activate Admin
- Deactivate Admin
- Assign material requests
- View Admin performance

Admin fields:

```text
Name
Email
Phone
Employee ID
Role
Status
Created At
```

---

# 19. MATERIAL REQUEST SYSTEM

This is a core feature.

A Site Manager should be able to create a Material Request.

Example:

```text
Project:
Kumar Residence

Client:
Mr. Kumar

Requested By:
Site Manager A

Required Date:
15 Oct 2026

Material:
Cement

Category:
Construction

Quantity:
100

Unit:
Bags

Priority:
High

Estimated Cost:
₹42,000

Notes:
Required for first-floor work.
```

---

# 20. MATERIAL REQUEST STATUS

Support:

```text
Requested
Pending Review
Approved
Rejected
Ordered
Partially Delivered
Delivered
Cancelled
```

Workflow:

Site Manager
↓
Creates Request
↓
Admin receives request
↓
Admin reviews
↓
Admin updates status
↓
Admin records material/cost information
↓
Material delivered
↓
Request completed

Owner can monitor everything.

---

# 21. MATERIAL REQUEST DATABASE

Fields:

```text
Request ID
Project ID
Client ID
Requested By
Assigned Admin
Material Name
Category
Description
Quantity
Unit
Required Date
Priority
Estimated Cost
Approved Cost
Actual Cost
Status
Requested Date
Approved Date
Ordered Date
Delivery Date
Completed Date
Notes
Created At
Updated At
```

---

# 22. MATERIAL REQUIREMENTS

Create a project-level material requirements view.

For each project show:

```text
Total Material Requests
Pending Requests
Approved Requests
Ordered
Delivered
Pending Material Cost
Approved Material Cost
Actual Material Cost
```

Example:

```text
Kumar Residence

Material Requirements

Cement          100 Bags       Delivered
Tiles           800 Sq Ft      Ordered
Lights          24 Units       Pending
Wood            15 Sheets      Delivered
Paint           40 Litres      Requested
```

---

# 23. MATERIAL COST TRACKING

Owner should see:

```text
Estimated Material Cost
Approved Material Cost
Actual Material Cost
Variance
```

Calculate:

```text
Variance = Actual Cost - Estimated Cost
```

Highlight cost overruns.

---

# 24. CLIENT DETAIL PAGE

Create a complete client detail page.

Sections:

### Client Information

Name
Contact
Address

### Project Information

Project
Project Cost
Start Date
Expected Completion
Handover

### Project Progress

Progress percentage
Current status
Timeline

### Site Manager

Assigned Site Manager

### Material Requirements

Material requests related to this client/project.

### Activity

All relevant updates.

---

# 25. PROJECT DETAIL PAGE

Create a professional project workspace.

Header:

```text
Project Name
Client
Status
Progress %
Handover Date
```

Tabs:

```text
Overview
Timeline
Progress Updates
Material Requests
Materials
Documents
Activity
```

---

# 26. PROJECT TIMELINE

Display:

```text
Project Started
       ↓
Design
       ↓
Approval
       ↓
Procurement
       ↓
Execution
       ↓
Finishing
       ↓
Handover
       ↓
Completed
```

Each milestone should support:

- Start date
- Target date
- Completed date
- Status
- Notes

---

# 27. SITE MANAGER DASHBOARD

Site Manager sees only assigned projects.

Dashboard:

```text
My Projects
Active Projects
Projects Near Deadline
Overdue Projects
Pending Material Requests
Delivered Materials
```

Project cards should show:

```text
Project
Client
Progress
Status
Handover Date
Days Remaining
Material Requests
```

---

# 28. SITE MANAGER PROJECT UPDATE

Create a simple update interface.

Fields:

```text
Project
Status
Progress %
Update Date
Milestone
Expected Completion
Issues
Notes
Next Action
```

After submission:

- Save update
- Update project current status/progress
- Create project activity
- Record user and timestamp

---

# 29. ADMIN DASHBOARD

Admin sees material-related workload.

KPI cards:

```text
New Requests
Pending Requests
Approved
Ordered
Partially Delivered
Completed
Overdue Material Requests
```

Table:

```text
Request ID
Project
Material
Quantity
Required Date
Priority
Requested By
Status
Assigned To
Action
```

---

# 30. ADMIN MATERIAL WORKFLOW

Admin can open a material request.

Show:

```text
Project
Client/project reference
Site Manager
Material
Quantity
Required Date
Estimated Cost
Notes
```

Admin actions:

```text
Approve
Reject
Order
Update Cost
Update Delivery Date
Mark Partially Delivered
Mark Delivered
Add Notes
```

All actions must be logged.

---

# 31. SEARCH

Implement global/search functionality.

Owner should be able to search:

- Client
- Project
- Site Manager
- Admin
- Material
- Request ID

Examples:

```text
Search "Kumar"
Search "Living Room"
Search "Cement"
Search "SM001"
```

---

# 32. FILTERING

Add useful filters.

Clients:

- Status
- Project
- Site Manager

Projects:

- Status
- Site Manager
- Deadline
- Priority

Material Requests:

- Status
- Priority
- Admin
- Site Manager
- Project
- Required Date

---

# 33. DATE FILTERS

Support:

```text
Today
This Week
This Month
Next 7 Days
Next 30 Days
Custom Date Range
```

Use proper date handling.

Store dates consistently in Supabase.

Display dates in a user-friendly Indian format where appropriate.

Example:

`08 Oct 2026`

---

# 34. OWNER ANALYTICS

Owner should be able to drill down.

Example:

Dashboard:

`12 Ongoing Projects`

Click →

List of 12 projects.

Click a project →

Project detail.

Similarly:

Site Manager performance
↓
Site Manager
↓
Assigned projects
↓
Project
↓
Project updates

Admin performance
↓
Admin
↓
Material requests
↓
Individual request

---

# 35. PERFORMANCE ANALYTICS

## Site Manager Metrics

Calculate:

```text
Assigned Projects
Completed Projects
Ongoing Projects
Delayed Projects
On-Time Completion %
Average Project Progress
Material Requests Created
Material Request Completion Time
```

## Admin Metrics

Calculate:

```text
Requests Assigned
Requests Completed
Pending Requests
Average Response Time
Average Completion Time
Overdue Requests
Total Material Value Managed
```

Avoid simplistic rankings if insufficient data exists.

Use useful metrics rather than misleading scores.

---

# 36. AUDIT LOG

Every important action must be logged.

Create an audit/activity table.

Track:

```text
User ID
Role
Action
Entity Type
Entity ID
Previous Value
New Value
Timestamp
IP/device metadata if appropriate
```

Examples:

```text
Site Manager updated project progress from 60% to 72%.

Admin changed material request MR-1004
from "Approved" to "Ordered".

Owner assigned Project P-1003
to Site Manager SM-04.
```

---

# 37. NOTIFICATIONS

Create a notification system.

Potential notifications:

### Owner

- Project approaching deadline
- Project overdue
- New material request
- High-priority material request
- Material cost exceeds estimate

### Site Manager

- Material request approved
- Material ordered
- Material delivered
- Request rejected
- Project deadline approaching

### Admin

- New material request
- High-priority request
- Required date approaching
- Request assigned

Use in-app notifications first.

Email notifications can be added through Supabase Edge Functions or an email provider if configured.

---

# 38. ROLE-BASED NAVIGATION

## OWNER

Sidebar:

```text
Dashboard
Clients
Projects
Site Managers
Admins
Material Requests
Materials
Reports
Activity
Users
Settings
```

## SITE MANAGER

Sidebar:

```text
Dashboard
My Projects
Material Requests
Materials
Activity
Profile
```

## ADMIN

Sidebar:

```text
Dashboard
Material Requests
Materials
Projects
Activity
Profile
```

Do not display inaccessible navigation items.

---

# 39. DATABASE DESIGN

Use Supabase PostgreSQL.

Recommended tables:

```text
profiles
roles
clients
projects
project_members
project_milestones
project_updates
material_requests
material_request_items
materials
material_deliveries
notifications
audit_logs
```

Optional:

```text
project_documents
client_documents
material_categories
project_statuses
```

---

# 40. PROFILES TABLE

Example:

```sql
profiles
---------
id UUID PRIMARY KEY
full_name TEXT
email TEXT
phone TEXT
role TEXT
employee_id TEXT
status TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Role should preferably be controlled through a secure role mechanism rather than trusting arbitrary frontend values.

---

# 41. CLIENTS TABLE

```sql
clients
---------
id UUID PRIMARY KEY
client_code TEXT UNIQUE
name TEXT NOT NULL
email TEXT
phone TEXT
alternate_phone TEXT
address TEXT
city TEXT
state TEXT
country TEXT
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
created_by UUID
```

---

# 42. PROJECTS TABLE

```sql
projects
---------
id UUID PRIMARY KEY
project_code TEXT UNIQUE
client_id UUID REFERENCES clients(id)
name TEXT NOT NULL
project_type TEXT
project_cost NUMERIC
start_date DATE
expected_completion_date DATE
handover_date DATE
actual_handover_date DATE
status TEXT
progress_percentage NUMERIC
priority TEXT
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
created_by UUID
```

---

# 43. PROJECT MEMBERS

Do not assume only one person can ever be assigned to a project.

Create:

```sql
project_members
---------------
id UUID PRIMARY KEY
project_id UUID REFERENCES projects(id)
user_id UUID REFERENCES profiles(id)
role TEXT
assigned_at TIMESTAMPTZ
removed_at TIMESTAMPTZ
status TEXT
```

This allows future scalability.

---

# 44. PROJECT UPDATES

```sql
project_updates
---------------
id UUID PRIMARY KEY
project_id UUID REFERENCES projects(id)
updated_by UUID REFERENCES profiles(id)
status TEXT
progress_percentage NUMERIC
update_date DATE
milestone TEXT
expected_completion_date DATE
issues TEXT
notes TEXT
next_action TEXT
created_at TIMESTAMPTZ
```

Never delete historical project updates unnecessarily.

---

# 45. PROJECT MILESTONES

```sql
project_milestones
-------------------
id UUID PRIMARY KEY
project_id UUID REFERENCES projects(id)
name TEXT
start_date DATE
target_date DATE
completed_date DATE
status TEXT
notes TEXT
sort_order INTEGER
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 46. MATERIAL REQUESTS TABLE

```sql
material_requests
-----------------
id UUID PRIMARY KEY
request_code TEXT UNIQUE
project_id UUID REFERENCES projects(id)
requested_by UUID REFERENCES profiles(id)
assigned_admin UUID REFERENCES profiles(id)
required_date DATE
priority TEXT
status TEXT
estimated_cost NUMERIC
approved_cost NUMERIC
actual_cost NUMERIC
requested_at TIMESTAMPTZ
approved_at TIMESTAMPTZ
ordered_at TIMESTAMPTZ
delivery_date DATE
completed_at TIMESTAMPTZ
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 47. MATERIAL REQUEST ITEMS

A request may contain multiple materials.

Therefore use:

```sql
material_request_items
----------------------
id UUID PRIMARY KEY
request_id UUID REFERENCES material_requests(id)
material_id UUID REFERENCES materials(id)
material_name TEXT
quantity NUMERIC
unit TEXT
estimated_unit_cost NUMERIC
approved_unit_cost NUMERIC
actual_unit_cost NUMERIC
notes TEXT
```

---

# 48. MATERIALS TABLE

```sql
materials
---------
id UUID PRIMARY KEY
name TEXT
category TEXT
unit TEXT
description TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 49. NOTIFICATIONS

```sql
notifications
-------------
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
title TEXT
message TEXT
type TEXT
entity_type TEXT
entity_id UUID
read_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

---

# 50. AUDIT LOGS

```sql
audit_logs
----------
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
role TEXT
action TEXT
entity_type TEXT
entity_id UUID
old_data JSONB
new_data JSONB
created_at TIMESTAMPTZ
```

---

# 51. SUPABASE SECURITY

This is extremely important.

Implement proper Row Level Security.

Do NOT depend only on:

```text
if user.role === "owner"
```

in React/Next.js.

Database policies must protect the data.

Example concepts:

### Owner

Can read/write all authorized business data.

### Site Manager

Can access only projects assigned to them.

### Admin

Can access only material/project information required for their role and assigned requests.

### Unauthorized user

Cannot access application data.

---

# 52. AUTHENTICATION REQUIREMENTS

Use Supabase Auth.

Login:

```text
Email
Password
```

After authentication:

1. Verify Supabase session.
2. Load user profile.
3. Determine role.
4. Redirect to role-specific dashboard.
5. Enforce access on every protected route.
6. Enforce access through Supabase RLS.

Logout must invalidate the session.

Only authorized email/password accounts can log in.

Do not create an open registration page.

The Owner should create/manage Admin and Site Manager accounts.

---

# 53. USER CREATION

Owner UI:

```text
+ Add User
```

Fields:

```text
Name
Email
Phone
Role
Employee ID
```

Roles:

```text
Admin
Site Manager
```

The owner should be able to:

- Create user
- Activate user
- Deactivate user
- Reset/trigger password setup
- Assign projects

Do not expose password values in the owner dashboard.

---

# 54. DEACTIVATED USERS

If a Site Manager or Admin is deactivated:

- They cannot log in.
- Existing project assignments/history remain.
- Historical activity remains.
- Their name remains visible in audit/history.
- Owner can assign their projects to another user.

Never hard-delete business history simply because a user leaves.

---

# 55. FINANCIAL PRIVACY

The Owner can see:

```text
Project Cost
Material Estimated Cost
Material Approved Cost
Material Actual Cost
Cost Variance
Overall Project Value
```

Site Managers and Admins should only see financial fields explicitly authorized for their role.

Use database-level protection where practical.

---

# 56. UI DESIGN

The application should feel:

- Premium
- Professional
- Clean
- Modern
- Fast
- Minimal
- Business-focused
- Responsive

Use the `design_handoff_teamhub` folder as the design source.

Do not create a generic dashboard if the design folder provides a specific design language.

---

# 57. BRANDING

Brand:

**Ignite Interior Decor**

Use the brand consistently:

```text
Ignite Interior Decor
```

Suggested visual direction:

- Premium interior-design aesthetic
- Elegant typography
- Clean cards
- Strong visual hierarchy
- Neutral/premium color palette based on supplied design
- Subtle shadows
- Rounded cards where consistent with design
- Professional tables
- High-quality dashboard visualizations

Do NOT introduce random colors that conflict with the existing design handoff.

---

# 58. RESPONSIVE DESIGN

The application must work on:

- Desktop
- Laptop
- Tablet
- Mobile

Owner dashboard should prioritize desktop/tablet.

Site Manager UI should be highly mobile-friendly because site managers may use the application from project sites.

Material request creation should be especially easy on mobile.

---

# 59. MOBILE SITE MANAGER EXPERIENCE

The Site Manager should be able to quickly:

1. Open project
2. View progress
3. Update progress
4. Create material request
5. View pending material requests
6. Upload photo/document if implemented
7. Add site note
8. View upcoming deadline

Minimize unnecessary clicks.

---

# 60. TABLE DESIGN

Tables should support:

- Search
- Sorting
- Filtering
- Pagination
- Status badges
- Date formatting
- Row actions
- Responsive behavior

Do not create excessively wide tables on mobile.

---

# 61. STATUS COLORS

Use semantic visual indicators.

Examples:

```text
Completed → success
Pending → warning
Delayed → destructive
In Progress → primary
Cancelled → muted
```

Use the design system's actual colors where available.

---

# 62. EMPTY STATES

Every module must have useful empty states.

Example:

```text
No material requests yet.

Create a material request when your project needs materials.
```

Do not show blank screens.

---

# 63. LOADING STATES

Implement:

- Skeleton loaders
- Button loading states
- Table loading states
- Form submission states

Do not make the interface appear frozen.

---

# 64. ERROR HANDLING

Implement friendly errors.

Examples:

```text
Unable to update project.
Please try again.
```

Never expose raw database errors to users.

Log technical errors appropriately.

---

# 65. FORM VALIDATION

Validate:

- Required fields
- Email
- Phone
- Dates
- Numeric costs
- Quantity
- Progress percentage
- Required material dates

Examples:

Progress must be:

```text
0–100
```

Expected completion date should not normally be before start date.

Handover date should be validated.

---

# 66. DATE LOGIC

Use a consistent date library if necessary.

Important calculations:

```text
days_remaining
days_overdue
project_duration
material_request_age
admin_response_time
```

Do not calculate dates incorrectly because of timezone conversions.

Use appropriate date-only types for project deadlines.

---

# 67. PROJECT DELAY LOGIC

A project is potentially delayed when:

```text
expected_completion_date < today
AND status != Completed
```

Display:

```text
Overdue by 5 days
```

However, do not automatically overwrite the project status to "Delayed" without a clear business rule.

Prefer displaying a derived deadline indicator separately from the manually controlled project status.

---

# 68. MATERIAL REQUEST DEADLINE LOGIC

Show:

```text
Required in 7 days
Due tomorrow
Due today
Overdue
Delivered
```

Prioritize urgent requests.

---

# 69. OWNER CLIENT LIST

Create a professional client table:

```text
Client
Project
Project Cost
Status
Progress
Site Manager
Start Date
Handover Date
Days Remaining
```

Clicking a client opens the client workspace.

---

# 70. OWNER PROJECT LIST

Columns:

```text
Project
Client
Status
Progress
Site Manager
Start Date
Expected Completion
Handover
Material Cost
```

Add filters.

---

# 71. MATERIAL REQUEST OWNER VIEW

Columns:

```text
Request
Project
Client
Material
Required Date
Priority
Requested By
Admin
Status
Estimated Cost
Actual Cost
```

---

# 72. SECURITY REQUIREMENTS

Implement:

- Supabase Auth
- RLS
- Protected routes
- Server-side authorization
- No service-role key in browser
- No hardcoded secrets
- Environment variables
- Secure password handling
- No plaintext passwords in database/application logs
- Input validation
- SQL injection prevention through Supabase client/query mechanisms
- Proper authorization checks
- Audit logs

---

# 73. ENVIRONMENT VARIABLES

Create/use:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never commit real secrets.

Use `.env.local`.

Provide `.env.example`.

The Owner credentials supplied by the business owner must be configured securely and not embedded into Git/source code.

---

# 74. SEED DATA

Create optional development/demo seed data.

Example:

Clients:

```text
Kumar Residence
Arun Villa
Priya Apartment
```

Site Managers:

```text
Site Manager 01
Site Manager 02
```

Admins:

```text
Admin 01
Admin 02
```

Projects should have different:

- Statuses
- Progress
- Deadlines
- Material requests

This allows the dashboard to be tested properly.

Clearly separate development seed accounts/data from production data.

---

# 75. DASHBOARD INTERACTION

Dashboard cards should be clickable.

Example:

```text
12 Ongoing Projects
```

Click →

Projects filtered to:

```text
status = ongoing
```

Similarly:

```text
5 Delayed Projects
```

Click →

Delayed project list.

---

# 76. REPORTS

Create reports for Owner.

Possible reports:

### Project Report

- Client
- Project
- Cost
- Status
- Progress
- Dates
- Site Manager

### Material Report

- Project
- Material
- Quantity
- Estimated cost
- Actual cost
- Status
- Required date

### Site Manager Report

- Projects
- Completion
- Delays
- Updates
- Material requests

### Admin Report

- Requests
- Processing time
- Completion
- Pending requests

Allow CSV export if practical.

---

# 77. ACTIVITY TIMELINE

Every project should have an activity timeline.

Example:

```text
08 Oct 2026
Site Manager updated progress to 72%.

07 Oct 2026
Material request MR-1004 approved.

06 Oct 2026
Project milestone "Finishing" started.

01 Oct 2026
Project assigned to Site Manager A.
```

This is important for accountability.

---

# 78. OWNER OVERVIEW

The Owner should be able to answer these questions immediately:

### Clients

- How many clients do we have?
- Which projects are ongoing?
- Which are completed?
- Which projects are delayed?

### Site Managers

- Who manages each project?
- Which Site Manager has the most projects?
- Which Site Manager is keeping projects on schedule?
- Which projects need attention?

### Admin

- How many material requests are pending?
- Which Admin has the most pending requests?
- Which requests are overdue?
- How quickly are requests being processed?

### Materials

- What materials are required?
- For which project?
- How much will they cost?
- What has been delivered?
- What is pending?

---

# 79. PERFORMANCE DASHBOARD LOGIC

Do not use only raw counts.

Include useful metrics such as:

### Site Manager On-Time Rate

```text
Completed projects on time
/
Total completed projects
* 100
```

### Admin Request Completion Rate

```text
Completed requests
/
Total assigned requests
* 100
```

### Material Cost Variance

```text
Actual Cost - Estimated Cost
```

### Project Progress

Use latest valid project update.

---

# 80. SCALABILITY

Design the database and application for:

```text
100+ clients
500+ projects
1000+ material requests
Multiple admins
Multiple site managers
```

Avoid hard-coded users/projects.

Use UUIDs.

Use proper indexes.

Add indexes to frequently queried columns:

```text
client_id
project_id
status
assigned_admin
requested_by
required_date
handover_date
expected_completion_date
```

---

# 81. DATABASE INDEXES

Create appropriate indexes such as:

```sql
projects(client_id)
projects(status)
projects(handover_date)
projects(expected_completion_date)
project_members(user_id)
material_requests(project_id)
material_requests(status)
material_requests(required_date)
material_requests(assigned_admin)
audit_logs(user_id)
audit_logs(entity_type, entity_id)
```

---

# 82. DATA INTEGRITY

Use foreign keys.

Use appropriate constraints.

Avoid orphan records.

Use transactions/RPC functions where multiple related records must update together.

Example:

Creating a material request with multiple material items should be atomic.

---

# 83. SOFT DELETE

For important business records, prefer:

```text
active/inactive
archived_at
```

instead of destructive deletion.

Especially for:

- Users
- Clients
- Projects
- Material requests
- Audit history

---

# 84. OWNER SETTINGS

Owner Settings should include:

### Company

```text
Company Name
Logo
Contact
Email
Phone
Address
```

### Users

Manage Admins and Site Managers.

### Project Statuses

Optional configuration.

### Material Categories

Examples:

```text
Civil
Electrical
Plumbing
Carpentry
Tiles
Paint
Lighting
Hardware
Furniture
Other
```

---

# 85. ACCESS MATRIX

Implement this approximately:

| Feature | Owner | Admin | Site Manager |
|---|---|---|---|
| Dashboard | Full | Admin | Assigned |
| Clients | All | Limited | Assigned |
| Project Cost | Yes | No/Limited | No/Limited |
| Projects | All | Relevant | Assigned |
| Project Updates | Yes | No | Yes |
| Material Requests | All | Assigned/Relevant | Create/View Own |
| Material Cost | Yes | Yes | Limited |
| Admin Management | Yes | No | No |
| Site Manager Management | Yes | No | No |
| User Management | Yes | No | No |
| Reports | Full | Limited | Limited |
| Audit Logs | Full | Relevant | Own/Relevant |
| Settings | Full | Profile | Profile |

Enforce actual access through RLS and backend authorization.

---

# 86. IMPORTANT PRIVACY RULE

Never rely on hiding a UI element as security.

For example:

Hiding "Project Cost" from Site Manager UI is NOT enough.

The Site Manager's API/database query must also prevent access to unauthorized financial information.

---

# 87. COMPONENT ARCHITECTURE

Create reusable components such as:

```text
AppShell
Sidebar
Topbar
PageHeader
StatCard
ProjectCard
ClientCard
StatusBadge
ProgressBar
DeadlineBadge
DataTable
FilterBar
SearchInput
DateRangePicker
Modal
ConfirmDialog
FormField
ActivityTimeline
ProjectTimeline
MaterialRequestCard
NotificationPanel
UserAvatar
EmptyState
LoadingSkeleton
```

Use reusable components instead of duplicating UI.

---

# 88. ROUTING

Suggested route structure:

```text
/login

/dashboard

/clients
/clients/[id]

/projects
/projects/[id]

/site-managers
/site-managers/[id]

/admins
/admins/[id]

/material-requests
/material-requests/[id]

/materials

/reports

/activity

/users

/settings
```

Role protection must apply to routes.

---

# 89. API / SERVER ARCHITECTURE

Prefer server-side operations for sensitive operations.

For example:

- Creating users
- Deactivating users
- Updating role
- Assigning users
- Sensitive financial operations

Do not expose Supabase service-role credentials to the browser.

---

# 90. SUPABASE AUTH USER MANAGEMENT

The Owner's user-management functionality may require server-side Supabase Admin API operations.

Implement securely.

The browser must never receive:

```text
SUPABASE_SERVICE_ROLE_KEY
```

---

# 91. LOGIN EXPERIENCE

Create a premium branded login page.

Display:

```text
Ignite Interior Decor

Project Management Portal

Email
Password

Sign In
```

Optional:

```text
Forgot password?
```

No public signup.

---

# 92. SESSION BEHAVIOR

After login:

Owner →

`/dashboard`

Admin →

`/dashboard`

Site Manager →

`/dashboard`

Maintain session securely.

Logout should clear the authenticated session.

---

# 93. PASSWORD MANAGEMENT

Never display user passwords.

Support:

- Password reset
- Secure password creation
- Password change

The Owner should be able to deactivate users, not view their passwords.

---

# 94. AUDITABILITY

Important changes must be auditable.

Track:

```text
Who
What
When
Before
After
```

This is especially important for:

- Project cost
- Project status
- Progress
- Handover date
- Material cost
- Material request status
- User assignments
- User activation/deactivation

---

# 95. PERFORMANCE

Use:

- Server-side fetching where appropriate
- Pagination
- Database indexes
- Efficient queries
- Avoid loading every client/project into the browser unnecessarily
- Debounced search
- Lazy loading where useful

---

# 96. ACCESSIBILITY

Implement:

- Keyboard navigation
- Accessible labels
- Good contrast
- Focus states
- Semantic HTML
- Accessible dialogs
- Accessible tables
- Screen-reader-friendly controls

---

# 97. TESTING

Create tests for critical workflows.

At minimum test:

### Authentication

- Owner login
- Admin login
- Site Manager login
- Invalid login
- Logout

### Authorization

- Site Manager cannot access another Site Manager's project
- Admin cannot access Owner-only financial information
- Owner can access everything

### Project

- Create project
- Update project
- Update progress
- Deadline calculation

### Material

- Site Manager creates request
- Admin sees request
- Admin updates status
- Cost updates
- Delivery updates

### User management

- Owner creates Site Manager
- Owner deactivates Site Manager
- Deactivated Site Manager cannot login

---

# 98. SECURITY TESTING

Verify RLS manually.

Attempt:

```text
Site Manager A → Project belonging to Site Manager B
Admin → Owner financial information
Unauthenticated → protected API
Deactivated user → protected application
```

All must fail appropriately.

---

# 99. ERROR AND EDGE CASES

Handle:

- Deleted/archived client
- Deactivated site manager
- Project without site manager
- Project without material request
- Material request without admin
- Overdue project
- Overdue material request
- Completed project receiving update
- Duplicate client
- Duplicate project code
- Duplicate material request
- Invalid dates
- Missing required fields

---

# 100. DEMO / DEVELOPMENT MODE

Create realistic demo data so the complete dashboard can be visually inspected.

The demo data should demonstrate:

- Ongoing projects
- Completed projects
- Delayed projects
- Upcoming handovers
- Multiple site managers
- Multiple admins
- Pending material requests
- Approved material requests
- Delivered materials
- Different material costs

---

# 101. DO NOT DO THESE THINGS

Do NOT:

- Hard-code project data
- Hard-code client data
- Hard-code users
- Hard-code passwords
- Store plaintext passwords
- Put Supabase service-role key in frontend
- Rely only on frontend role checks
- Allow public registration
- Expose all client data to all users
- Delete historical audit data
- Delete user history when a user is deactivated
- Build a fake dashboard with static numbers
- Create non-functional buttons
- Leave major workflows as placeholders

Every visible major action should either work or clearly be marked as intentionally deferred.

---

# 102. IMPORTANT: REAL FUNCTIONALITY

This must be a functional SaaS application, not merely a UI prototype.

The following must work end-to-end:

### Owner

Login
→ Dashboard
→ Create client
→ Create project
→ Add Site Manager
→ Assign Site Manager
→ Add Admin
→ View material requests
→ View analytics

### Site Manager

Login
→ View assigned projects
→ Update project
→ Create material request
→ Track material request

### Admin

Login
→ View requests
→ Process request
→ Update status
→ Update cost
→ Mark delivery

### Owner

View updated data in real time or after refresh.

---

# 103. REAL-TIME / DATA REFRESH

Where appropriate, use Supabase Realtime.

Useful examples:

- New material request
- Material request status update
- Project status update
- Notifications

If realtime adds unnecessary complexity for a particular view, implement reliable refresh/invalidation instead.

---

# 104. FILE / PHOTO SUPPORT

If supported by the existing design, allow Site Managers to attach:

- Site photos
- Material photos
- Documents

Use Supabase Storage.

Create appropriate storage policies.

Files must respect project/client permissions.

---

# 105. PROJECT DOCUMENTS

Optional document structure:

```text
Project
 ├── Photos
 ├── Drawings
 ├── Material Documents
 ├── Site Reports
 └── Other
```

Do not allow unauthorized users to access files through public URLs.

Use protected access.

---

# 106. FINAL UI QUALITY

Before considering the application complete:

Check:

- No broken layouts
- No placeholder lorem ipsum
- No fake data in production paths
- No console errors
- No TypeScript errors
- No inaccessible buttons
- No broken navigation
- No unprotected routes
- No missing loading states
- No missing empty states
- No mobile overflow
- No exposed secrets

---

# 107. FINAL ACCEPTANCE CRITERIA

The application is complete only when:

### Authentication

- Owner can login.
- Admin can login.
- Site Manager can login.
- Deactivated users cannot login.
- Logout works.

### Owner

- Can manage users.
- Can manage clients.
- Can manage projects.
- Can assign Site Managers.
- Can manage material requests.
- Can see project costs.
- Can see material costs.
- Can view analytics.
- Can view activity history.

### Site Manager

- Can see only assigned projects.
- Can update project status.
- Can update project progress.
- Can update dates.
- Can create material requests.
- Can see material request status.

### Admin

- Can see assigned/relevant material requests.
- Can update material requests.
- Can update material costs.
- Can update delivery status.
- Can track pending work.

### Security

- RLS enabled.
- Role-based access enforced.
- Client privacy enforced.
- Financial privacy enforced.
- No service key exposed.
- No hardcoded passwords.

### Database

- Supabase connected.
- Relationships implemented.
- Indexes implemented.
- Audit logs implemented.
- Proper timestamps implemented.

### UI

- Matches `design_handoff_teamhub`.
- Responsive.
- Professional.
- Accessible.
- Consistent.

---

# 108. DEVELOPMENT ORDER

Implement in this order:

## Phase 1 — Foundation

1. Inspect repository
2. Inspect `design_handoff_teamhub`
3. Identify existing stack
4. Configure Supabase
5. Configure environment variables
6. Set up application shell
7. Implement authentication

## Phase 2 — Database

8. Create schema
9. Create relationships
10. Create indexes
11. Create RLS policies
12. Create seed/development data

## Phase 3 — User Management

13. Owner profile
14. Admin management
15. Site Manager management
16. Activation/deactivation
17. Project assignment

## Phase 4 — Clients & Projects

18. Client CRUD
19. Project CRUD
20. Project assignment
21. Project milestones
22. Project updates
23. Deadline calculations

## Phase 5 — Materials

24. Material catalog
25. Material requests
26. Material request items
27. Admin workflow
28. Delivery tracking
29. Cost tracking

## Phase 6 — Dashboards

30. Owner dashboard
31. Site Manager dashboard
32. Admin dashboard
33. Analytics
34. Performance views

## Phase 7 — Audit & Notifications

35. Audit logs
36. Activity timeline
37. Notifications
38. Deadline alerts

## Phase 8 — Quality

39. Responsive optimization
40. Accessibility
41. Error handling
42. Loading states
43. Security testing
44. RLS testing
45. End-to-end workflow testing

---

# 109. CODING STYLE

Use:

- TypeScript
- Strict typing
- Reusable components
- Clean folder structure
- Small focused functions
- Server/client separation
- Proper error handling
- Meaningful variable names
- No unnecessary duplication

Avoid:

- `any` unless unavoidable
- Huge components
- Duplicate CRUD logic
- Hard-coded role checks everywhere
- Hard-coded IDs
- Hard-coded secrets

---

# 110. EXPECTED DELIVERABLE

At the end of development, provide:

1. Fully functional application
2. Supabase database schema/migrations
3. RLS policies
4. Authentication implementation
5. Owner/Admin/Site Manager roles
6. Dashboard
7. Client management
8. Project management
9. Material management
10. Material request workflow
11. Date/deadline tracking
12. Performance analytics
13. Audit logs
14. Notifications
15. Responsive UI
16. `.env.example`
17. README
18. Setup instructions
19. Database setup instructions
20. Test instructions

---

# 111. README REQUIREMENTS

Create a clear README containing:

```text
Project Overview
Tech Stack
Prerequisites
Environment Variables
Supabase Setup
Database Migration
Authentication Setup
Owner Account Setup
Development
Production Build
Deployment
Testing
RLS / Security Notes
```

Do NOT put real production passwords in README.

---

# 112. PRODUCTION OWNER ACCOUNT

The business owner has provided a designated Owner account:

```text
Email:
kishore@igniteinteriordecor.com
```

Use the password supplied by the business owner through a secure environment/secret configuration.

Do not hard-code or commit the password.

The application must recognize this user as the Owner through a secure role/profile mechanism.

Do not make email string matching alone the only authorization mechanism.

---

# 113. FINAL PRODUCT VISION

The finished application should allow the Owner to open the dashboard and immediately understand:

```text
How many clients do I have?

How many projects are ongoing?

Which projects are delayed?

Which projects are close to handover?

How much is each project worth?

What materials are required?

How much are the materials costing?

Which Site Manager is responsible?

How is each Site Manager performing?

Which Admin is handling each material request?

Which material requests are pending?

Which requests are overdue?

What happened on each project and when?
```

The Site Manager should be able to manage project execution from a phone or desktop.

The Admin should be able to manage material requests efficiently.

The Owner should have complete visibility without exposing unnecessary sensitive data to other employees.

The system should be designed so that future modules such as invoicing, vendor management, inventory, quotations, purchase orders, payments, client portal, and WhatsApp/email notifications can be added without redesigning the core architecture.

---

# 114. START NOW

Start by:

1. Inspecting the current repository.
2. Inspecting `design_handoff_teamhub`.
3. Identifying the existing frontend/backend architecture.
4. Identifying any existing components that can be reused.
5. Checking whether Supabase is already configured.
6. Creating a technical implementation plan.
7. Implementing the database and security layer first.
8. Then implement authentication and roles.
9. Then implement clients/projects.
10. Then material requests.
11. Then dashboards and analytics.
12. Then test all permissions and workflows.

Do not stop at a visual mockup.

Build the actual working SaaS application.

If an existing project structure conflicts with any recommendation in this specification, preserve the existing architecture where reasonable and adapt the implementation rather than unnecessarily rewriting the project.

The highest priorities are:

**Security → Data integrity → Role-based access → Core workflows → Usability → Dashboard analytics → Visual polish.**

##superbase credentials

1. Install package
Run this command to install the required dependencies.
Code:
File: Code
```
npm install @supabase/supabase-js
```

2. Add files
Add env variables, create a Supabase client, and use it in your app to query data.
Code:
File: .env
```
VITE_SUPABASE_URL=https://xlqryvkweiilhztewgaz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_AQ3BjJAdLp8XLGF-HpzLEg_5UYvE28-
```

File: utils/supabase.ts
```
1import { createClient } from '@supabase/supabase-js';
2
3const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
4const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
5
6export const supabase = createClient(supabaseUrl, supabaseKey);
```

File: App.tsx
```
1import { useState, useEffect } from 'react'
2import { supabase } from './utils/supabase'
3
4export default function App() {
5  const [todos, setTodos] = useState([])
6
7  useEffect(() => {
8    async function getTodos() {
9      const { data: todos } = await supabase.from('todos').select()
10
11      if (todos) {
12        setTodos(todos)
13      }
14    }
15
16    getTodos()
17  }, [])
18
19  return (
20    <ul>
21      {todos.map((todo) => (
22        <li key={todo.id}>{todo.name}</li>
23      ))}
24    </ul>
25  )
26}
```

3. Install Agent Skills (optional)
Agent Skills give AI coding tools ready-made instructions, scripts, and resources for working with Supabase more accurately and efficiently.
Code:
File: Code
```
npx skills add supabase/agent-skills
```

## deploy using the vercel when i say deploy 

Build **Ignite Interior Decor** as a production-quality, scalable SaaS platform.

