# Ankelba Software Requirements Specification (SRS)

**Project:** Parent Communication and Child Activity Reporting Platform for Daycare Centers  
**Institution:** HiLCoE — School of Computer Science and Technology  
**Version:** 1.2 — Draft for Advisor Review
**Prepared by:** Arsema Alemayehu; Helina Fikru; Melat Hailu; Mistire Tilahun  
**Date:** 25 October 2026

> **AI-readable conversion note:** This Markdown version preserves the document's textual requirements, tables, use cases, business rules, traceability, and validation criteria. Word-only visual styling and embedded diagrams were removed to reduce parsing overhead; each omitted diagram is referenced at its original location and its content is represented by the surrounding textual sections.

# Document Control
| **Document Title**  | Software Requirements Specification (SRS) - Ankelba                            |
|---------------------|--------------------------------------------------------------------------------|
| **Project**         | Parent Communication and Child Activity Reporting Platform for Daycare Centers |
| **Version**         | 1.2                                                                            |
| **Status**          | Draft for Advisor Review                                                       |
| **Prepared By**     | Arsema Alemayehu; Helina Fikru; Melat Hailu; Mistire Tilahun                   |
| **Date**            | 25 October 2026                                                                    |
| **Source Baseline** | Updated Senior Project Proposal, August 2026                                   |

## Revision History
| **Version** | **Date**     | **Description**                                                                                                                                                                             | **Prepared By** |
|-------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------|
| 1.0         | August 2026  | Initial SRS based on the updated senior project proposal and advisor-requested features.                                                                                                    | Project Team    |
| 1.1         | October 2026 | Added multi-tenant SaaS architecture: Super Administrator role, Daycare tenant self-registration/approval workflow, 30-day trial subscriptions, and row-level database tenant isolation (`daycare_id`). | Project Team    |
| 1.2         | 25 October 2026 | Clarified the package-first customer journey, separate subscription phases, operator entry point, guided setup and manual subscription renewal for the project pilot. | Project Team |

# Table of Contents
| **1. Introduction**                                        | 1.1 Purpose                                              |
|------------------------------------------------------------|----------------------------------------------------------|
| 1.2 Product Scope                                          | 1.3 Intended Audience                                    |
| 1.4 Definitions and Acronyms                               | 1.5 References                                           |
| 1.6 Requirement Language and Conventions                   | **2. Overall Description**                               |
| 2.1 Product Perspective                                    | 2.2 Summary of Product Functions                         |
| 2.3 User Classes and Characteristics                       | 2.4 Role and Access Summary                              |
| 2.5 Operating Environment                                  | 2.6 Design and Implementation Constraints                |
| 2.7 Assumptions and Dependencies                           | 2.8 Out of Scope                                         |
| 2.9 Open / TBD Requirements for Advisor Confirmation       | **3. System Context and Use Case Model**                 |
| 3.1 Use Case Overview                                      | 3.2 Use Case Summary                                     |
| **4. Functional Requirements**                             | 4.1 User and Access Management                           |
| 4.2 Child Profile Management                               | 4.3 Attendance Management                                |
| 4.4 Daily Activity Reporting                               | 4.5 Health and Incident Reporting                        |
| 4.6 Parent-Daycare Communication, Announcements and Alerts | 4.7 Report Access, History and Administrative Monitoring |
| 4.8 Centralized Database and Record Management             | 4.9 AI Parent Guide                                      |
| 4.10 Biometric Guardian Verification                       | 4.11 Daycare E-commerce and Payment                      |
| 4.12 Simple Events Calendar                                | 4.13 Audit and Accountability Requirements               |
| **5. External Interface Requirements**                     | 5.1 User Interface Requirements                          |
| 5.2 Hardware Interface Requirements                        | 5.3 Software and Service Interface Requirements          |
| 5.4 Communication Interface Requirements                   | **6. Data Requirements**                                 |
| 6.1 Main Data Entities                                     | 6.2 Data Integrity Rules                                 |
| 6.3 Data Privacy and Sensitivity                           | 6.4 Backup and Recovery                                  |
| **7. Non-Functional Requirements**                         | 7.1 Security                                             |
| 7.2 Privacy                                                | 7.3 Reliability and Data Integrity                       |
| 7.4 Usability                                              | 7.5 Performance                                          |
| 7.6 Availability and Graceful Degradation                  | 7.7 Maintainability                                      |
| 7.8 Compatibility and Accessibility                        | 7.9 Testability                                          |
| **8. Detailed Use Case Specifications**                    | **9. Business Rules**                                    |
| **10. Requirements Traceability**                          | **11. Acceptance and Validation Criteria**               |
| **Appendix A. Advisor Review Checklist**                   | **Appendix B. Proposed Verification Methods**            |

# 1. Introduction
## 1.1 Purpose
This Software Requirements Specification defines the functional and non-functional requirements for Ankelba, a Parent Communication and Child Activity Reporting Platform for Daycare Centers. It translates the updated senior project proposal into a more precise description of what the software must do, who is allowed to do it, what information is managed, how the major modules interact, and what constraints must be respected during design, implementation, testing, and evaluation.

The document is intended to serve as the requirements baseline for the project team and as a review document for the advisor. Requirements that are not fully decided in the proposal are marked as TBD or are explicitly identified for advisor confirmation rather than being silently assumed.

## 1.2 Product Scope
Ankelba is designed to organize communication and child-related reporting between daycare administrators, caregivers or teachers, and registered parents or guardians. The core platform manages users, child profiles, attendance, daily activity reports, health and incident reports, parent-daycare communication, report history, announcements, alerts, and administrative monitoring.

The updated scope also includes five added areas: a centralized database and record-management layer, an AI Parent Guide, biometric verification of authorized adult guardians during child pickup, a limited daycare e-commerce module, and a simple events calendar. These additions extend the original communication and reporting system but do not change Ankelba into a complete daycare enterprise-management system.

## 1.3 Intended Audience
- Project advisor and academic reviewers, who will review the completeness and correctness of the requirements.

- Project team members, who will use the SRS as the basis for analysis, design, implementation, and testing.

- Daycare administrators and caregivers, who may validate operational workflows and access rules.

- Parents or guardians participating in requirements validation or user-acceptance evaluation.

- Future maintainers or developers who need to understand the intended behavior and boundaries of the system.

## 1.4 Definitions and Acronyms
| **Term**                | **Meaning**                                                                                                                                |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Ankelba                 | The proposed parent communication and child activity reporting platform.                                                                   |
| SRS                     | Software Requirements Specification.                                                                                                       |
| RBAC                    | Role-Based Access Control; restricting functions and information according to a user role.                                                 |
| Parent/Guardian         | A registered adult user who is authorized to access information for a linked child.                                                        |
| Authorized Guardian     | An approved adult who is allowed to collect a child and may be enrolled for biometric pickup verification.                                 |
| Caregiver/Teacher       | Daycare staff responsible for recording attendance, activities, observations, and related child information.                               |
| Daycare Administrator   | Authorized user who manages user accounts, child records, announcements, products, events, monitoring, and other administrative functions. |
| AI Parent Guide         | An AI-assisted feature that provides general, non-medical everyday guidance to parents or guardians.                                       |
| Biometric Verification  | An additional identity-verification step used for authorized adult guardians during child pickup.                                          |
| Pay at Daycare          | A payment option in which an order is placed in Ankelba and payment is completed at the daycare.                                           |
| Digital Payment Gateway | An approved external payment service used to process electronic payments for daycare-store orders.                                         |
| Super Administrator    | SaaS platform operator responsible for onboarding daycares, approving registrations, managing subscriptions, and platform-wide monitoring.|
| Tenant / Daycare Center | An independent daycare organization registered on the Ankelba SaaS platform with its own children, staff, classrooms, and operational data.|
| Row-Level Multi-Tenancy | Database architecture where all operational tables include a `daycare_id` foreign key and queries are scoped to prevent cross-tenant data leakage. |
| TBD                     | To Be Determined; a requirement detail that must be confirmed during advisor or stakeholder review.                                        |

## 1.5 References
[1] Ankelba / Parent Communication and Child Activity Reporting Platform for Daycare Centers, Updated Senior Project Proposal, August 2026.

[2] HiLCoE, School of Computer Science and Technology, Senior Project Documentation Guideline, ver. 1.4.3, 2024.

[3] ISO/IEC/IEEE 29148:2018, Systems and Software Engineering - Life Cycle Processes - Requirements Engineering.

[4] ISO/IEC 25010:2023, Systems and Software Engineering - Systems and Software Quality Requirements and Evaluation (SQuaRE) - Product Quality Model.

[5] OWASP Foundation, OWASP Application Security Verification Standard (ASVS).

[6] W3C, Web Content Accessibility Guidelines (WCAG) 2.2, 2023.

[7] Chapa, Developer Documentation - Accept Payments and API Integration (candidate payment integration referenced by the proposal).

[8] Federal Democratic Republic of Ethiopia, Personal Data Protection Proclamation, Proclamation No. 1321/2024 (referenced by the proposal).

## 1.6 Requirement Language and Conventions
The word 'shall' identifies a mandatory requirement for the planned system. 'Should' identifies a desirable requirement that may depend on available time, hardware, or external-service approval. Requirements marked TBD need advisor or stakeholder confirmation before the SRS is baselined for implementation.

# 2. Overall Description
## 2.1 Product Perspective
Ankelba is a purpose-built daycare information system rather than a general messaging application. It centralizes child-related information and provides role-based interfaces for parents or guardians, caregivers or teachers, and daycare administrators. The core reporting and communication functions remain the foundation of the system. AI guidance, biometric guardian verification, e-commerce, and events management are additional modules connected through the same centralized data layer.

> **Figure 1 — High-level system context.** Visual diagram omitted from this text-optimized Markdown version. The actors, modules, and interactions are described in Sections 2.2–3.2.

## 2.2 Summary of Product Functions
| **Function**                    | **Summary**                                                                                                                             |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| User and Access Management      | Create and manage user accounts, authenticate users, and enforce role-based access.                                                     |
| Child Profile Management        | Register and update child information, emergency contacts, care instructions, parent/guardian links, and group/caregiver assignment.    |
| Attendance Management           | Record check-in, check-out, absence, and attendance history.                                                                            |
| Daily Activity Reporting        | Record meals, sleep, learning/play activities, mood, behavior, and general observations.                                                |
| Health and Incident Reporting   | Record health observations and unusual incidents and communicate them to authorized parents/guardians without diagnosing.               |
| Communication and Alerts        | Support structured messages, announcements, reminders, alerts, and optional authorized activity photographs.                            |
| Report Access and Monitoring    | Provide history to authorized users and administrative monitoring of reporting activities.                                              |
| Centralized Database            | Store and relate operational, communication, biometric-reference, e-commerce, event, payment, and audit-related records.                |
| AI Parent Guide                 | Provide general recommendations on activities, meals, outfits, routines, daycare preparation, and related everyday parenting questions. |
| Biometric Guardian Verification | Support enrollment and verification of authorized adult guardians during child pickup, with a manual fallback.                          |
| Daycare E-commerce              | Allow the daycare to list its own supplies and allow parents to browse, order, pay using available options, and follow order status.    |
| Simple Events Calendar          | Allow administrators to publish scheduled events and parents/guardians to view them.                                                    |

## 2.3 User Classes and Characteristics
| **User Class**                           | **Characteristics / Responsibilities**                                                                                                                                                                                                                     |
|------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Super Administrator (SaaS Operator)      | Platform operator who onboards daycares, reviews/approves self-registered daycare applications, manages 30-day trial and standard subscriptions, suspends/activates tenants, and monitors cross-platform health and analytics. Highest global privileges.     |
| Daycare Administrator                    | Manages users, children, groups, announcements, events, products, basic stock, orders, payment status, monitoring, and guardian biometric enrollment/verification for their specific daycare center.                                                        |
| Caregiver / Teacher                      | Records and updates child-related operational information such as attendance, daily activities, observations, health notes, and incidents for children within the caregiver's permitted responsibility. Exact assignment restrictions are to be confirmed. |
| Parent / Guardian                        | Views only linked child information, receives communication, uses the AI Parent Guide, views events, and uses the daycare store. May also be an authorized pickup guardian. Strictly linked to a single daycare center.                                    |
| Authorized Guardian (pickup designation) | An adult approved to collect a child. This is primarily a child-pickup authorization designation rather than a separate application role. The adult may be enrolled for biometric verification.                                                            |

## 2.4 Role and Access Summary
| **Function**                             | **Super Administrator** | **Daycare Administrator**           | **Caregiver / Teacher**       | **Parent / Guardian**              |
|------------------------------------------|-------------------------|-------------------------------------|-------------------------------|------------------------------------|
| Onboard / approve daycare tenants        | Yes                     | No                                  | No                            | No                                 |
| Manage daycare subscription state/trials | Yes                     | View own status                     | No                            | No                                 |
| Global cross-tenant metrics/audit        | Yes                     | No                                  | No                            | No                                 |
| Manage user accounts                     | All daycares            | Own daycare only                    | No                            | Own account only                   |
| Manage child profiles and guardian links | View all                | Yes (own daycare)                   | View/update as permitted      | View linked child                  |
| Record attendance                        | No                      | Yes                                 | Yes, as permitted             | View linked child history          |
| Create daily activity reports            | No                      | Monitor / may correct if authorized | Yes                           | View linked child reports          |
| Record health / incident information     | No                      | Yes / monitor                       | Yes                           | View linked child information      |
| Messages / announcements / alerts        | Global announcements    | Manage / publish (own center)       | Communicate as permitted      | Receive / communicate              |
| AI Parent Guide                          | Not required            | Not required                        | Not required                  | Yes                                |
| Biometric guardian enrollment            | No                      | Yes                                 | Only if explicitly authorized | No                                 |
| Biometric pickup verification            | No                      | Yes                                 | Only if explicitly authorized | Presents identity for verification |
| Manage daycare products / orders         | No                      | Yes                                 | No unless later authorized    | Browse / order / track             |
| Manage events                            | Global/platform events  | Yes (own center)                    | No unless later authorized    | View                               |

*Note: Access for caregivers/teachers is limited to the children and functions permitted by the daycare. The exact assignment model will be confirmed during requirements review.*

## 2.5 Operating Environment
- Responsive web application accessible from modern desktop and mobile web browsers.

- Proposed application stack from the project proposal: React frontend, Node.js/Express backend, and PostgreSQL database.

- Internet or local network connectivity is required for features that depend on server access; cloud-based AI and digital payment require internet connectivity.

- Biometric verification requires a compatible adult biometric device or supported platform interface at the daycare. The exact device/modality is TBD.

- A secure hosting or local deployment environment will be selected during deployment preparation.

## 2.6 Design and Implementation Constraints
- Child-related information is sensitive and shall be accessible only to authorized users.

- The first version shall not collect biometric data from children.

- Biometric verification shall remain an additional pickup safety control, not the only available method for releasing a child to an authorized guardian.

- The AI Parent Guide shall remain within general informational guidance and shall not provide medical diagnosis, treatment, or professional psychological counseling.

- The e-commerce module shall be limited to products supplied by the daycare and shall not operate as a third-party marketplace or home-delivery service.

- Digital payment depends on approval and connectivity of the selected external payment gateway; Pay at Daycare remains available.

- The project shall remain achievable within the senior-project timeline and available student resources.

## 2.7 Assumptions and Dependencies
- A selected daycare center and representative users will provide sufficient feedback for requirements validation and pilot evaluation.

- Authorized staff will enter child and activity information accurately and on time.

- The daycare will define which adult guardians are authorized to collect each child.

- If a cloud AI provider is used, the provider will be available during AI-guidance use; failure of the AI service shall not prevent core daycare reporting functions.

- Live digital payments require a valid merchant/payment-gateway setup. Sandbox testing may be used if live approval is not available during development.

- Biometric hardware availability and supported integration method will be confirmed before biometric implementation is finalized.

## 2.8 Out of Scope
- Payroll and employee recruitment

- Complete accounting

- Daycare fee collection

- Transportation management

- Live CCTV streaming

- GPS tracking

- Automatic medical diagnosis

- Government or hospital system integration

- Home-delivery logistics

- Third-party marketplace selling

- Advanced warehouse management

- Biometric identification of children

## 2.9 Open / TBD Requirements for Advisor Confirmation
| **ID**     | **Requirement**                                                                                                                 |
|------------|---------------------------------------------------------------------------------------------------------------------------------|
| **TBD-01** | Exact biometric modality and device/platform to be used for adult guardian verification.                                        |
| **TBD-02** | Exact digital payment gateway for live operation and whether live merchant approval will be available before defense.           |
| **TBD-03** | Exact AI provider/model and whether child-profile context will be sent to an external AI service or minimized/anonymized first. |
| **TBD-04** | Whether authorized activity photographs are part of the mandatory first release or remain optional.                             |
| **TBD-05** | Whether notifications are in-app only in the first release or include email/SMS/push delivery.                                  |
| **TBD-06** | Exact caregiver-to-child/group assignment rules.                                                                                |
| **TBD-07** | Record-retention periods for child, communication, biometric-reference, AI-interaction, and e-commerce data.                    |
| **TBD-08** | Exact pilot load and measurable response-time target for performance acceptance.                                                |

# 3. System Context and Use Case Model
## 3.1 Use Case Overview
> **Figure 2 — High-level use-case overview.** Visual diagram omitted from this text-optimized Markdown version. The use cases are listed in Section 3.2 and specified in detail in Section 8.

The diagram is an overview rather than a substitute for the detailed requirements. It shows the major interactions already defined by the updated proposal. External AI, biometric, and payment services are supporting interfaces rather than human user roles.

## 3.2 Use Case Summary
| **ID** | **Use Case**                                | **Primary Actor(s)**                     | **Purpose**                                                                            |
|--------|---------------------------------------------|------------------------------------------|----------------------------------------------------------------------------------------|
| UC-01  | Authenticate User                           | All registered users                     | Access the functions allowed by the user role.                                         |
| UC-02  | Manage User Accounts                        | Administrator                            | Create, update, activate/deactivate, and assign roles to accounts.                     |
| UC-03  | Manage Child Profile                        | Administrator                            | Register/update child data and related care information.                               |
| UC-04  | Link Parent/Guardian to Child               | Administrator                            | Associate authorized adults with the correct child.                                    |
| UC-05  | Record Attendance                           | Administrator / Caregiver                | Record check-in, check-out, absence, and attendance history.                           |
| UC-06  | Create Daily Activity Report                | Caregiver / Teacher                      | Record meals, sleep, activities, mood, behavior, and observations.                     |
| UC-07  | Record Health / Incident Information        | Caregiver / Administrator                | Record health observations and unusual incidents.                                      |
| UC-08  | View Child Reports and History              | Authorized users                         | View current and previous authorized child information.                                |
| UC-09  | Communicate / Publish Announcement or Alert | Administrator / Caregiver / Parent       | Exchange structured messages and receive/publish permitted communication.              |
| UC-10  | Use AI Parent Guide                         | Parent / Guardian                        | Request general everyday parenting recommendations.                                    |
| UC-11  | Enroll Authorized Guardian Biometric        | Administrator / authorized daycare staff | Create an adult guardian biometric verification reference linked to authorized pickup. |
| UC-12  | Verify Guardian and Complete Pickup         | Administrator / authorized daycare staff | Verify an authorized adult and complete child checkout.                                |
| UC-13  | Manage Daycare Products                     | Administrator                            | Create/update products, prices, and basic stock.                                       |
| UC-14  | Place Daycare Store Order                   | Parent / Guardian                        | Browse products, build cart, and place an order.                                       |
| UC-15  | Make / Record Payment                       | Parent / Guardian / System               | Use Pay at Daycare or an available digital-payment method and record verified status.  |
| UC-16  | Manage Order                                | Administrator                            | Review and update order status.                                                        |
| UC-17  | Manage / View Events                        | Administrator / Parent                   | Publish events and view upcoming calendar information.                                 |
| UC-18  | Administrative Monitoring                   | Administrator                            | Monitor users, children, reports, announcements, and selected summaries.               |

# 4. Functional Requirements
The following requirements are written as system behavior statements. They preserve the functions defined in the updated proposal and make the added AI, database, biometric, e-commerce, and events features explicit enough for design and testing.

## 4.1 User and Access Management
| **ID**        | **Requirement**                                                                                                                            |
|---------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-UAM-01** | The system shall allow registered users to authenticate before accessing protected functions.                                              |
| **FR-UAM-02** | The system shall support at least the roles Daycare Administrator, Caregiver/Teacher, and Parent/Guardian.                                 |
| **FR-UAM-03** | The system shall enforce role-based access control on protected pages, actions, and records.                                               |
| **FR-UAM-04** | The system shall allow an administrator to create and manage caregiver and parent/guardian accounts.                                       |
| **FR-UAM-05** | The system shall prevent a parent/guardian from accessing child records that are not linked to that user.                                  |
| **FR-UAM-06** | The system shall restrict administrative functions to users with the required administrative permission.                                   |
| **FR-UAM-07** | The system shall support logout and invalidate or end the active authenticated session according to the selected session design.           |
| **FR-UAM-08** | The system shall record sufficient account status information to allow an administrator to disable or reactivate an account when required. |
| **FR-UAM-09** | The system shall provide a public self-registration interface allowing prospective daycare centers to apply for platform access with daycare details and director credentials. |
| **FR-UAM-10** | The system shall allow the Super Administrator to review submitted daycare applications, approve or reject them, activate 30-day trial subscriptions, and suspend or reactivate tenant access. |
| **FR-UAM-11** | The system shall enforce strict row-level tenant data isolation using `daycare_id`, ensuring daycare administrators, staff, and parents are confined strictly to their assigned daycare center. |

## 4.2 Child Profile Management
| **ID**       | **Requirement**                                                                                                           |
|--------------|---------------------------------------------------------------------------------------------------------------------------|
| **FR-CH-01** | The system shall allow an administrator to register a child profile.                                                      |
| **FR-CH-02** | The system shall allow authorized users to update basic child information according to their permissions.                 |
| **FR-CH-03** | The system shall allow emergency contacts and relevant care instructions to be recorded for a child.                      |
| **FR-CH-04** | The system shall allow a child to be linked with one or more authorized parents/guardians as permitted by daycare policy. |
| **FR-CH-05** | The system shall support assignment of a child to a caregiver, class, or group as configured by the daycare.              |
| **FR-CH-06** | The system shall prevent an unauthorized user from modifying child-profile relationships or pickup authorization.         |
| **FR-CH-07** | The system shall maintain a unique internal identifier for each child record.                                             |

## 4.3 Attendance Management
| **ID**        | **Requirement**                                                                                                                                                                                            |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-ATT-01** | The system shall allow authorized daycare staff to record a child check-in.                                                                                                                                |
| **FR-ATT-02** | The system shall allow authorized daycare staff to record a child check-out.                                                                                                                               |
| **FR-ATT-03** | The system shall allow authorized daycare staff to record a child absence.                                                                                                                                 |
| **FR-ATT-04** | The system shall store the date and relevant time information for attendance events.                                                                                                                       |
| **FR-ATT-05** | The system shall provide attendance history to authorized users.                                                                                                                                           |
| **FR-ATT-06** | The system shall prevent logically conflicting active attendance states where practical, such as creating repeated active check-ins without closing the earlier attendance record.                         |
| **FR-ATT-07** | When biometric pickup verification is enabled for the selected workflow, the system shall require successful authorized-guardian verification or an approved manual fallback before checkout is finalized. |

## 4.4 Daily Activity Reporting
| **ID**        | **Requirement**                                                                                     |
|---------------|-----------------------------------------------------------------------------------------------------|
| **FR-DAR-01** | The system shall allow a caregiver/teacher to create a daily activity report for a permitted child. |
| **FR-DAR-02** | The system shall support recording meals and snacks.                                                |
| **FR-DAR-03** | The system shall support recording sleeping or rest periods.                                        |
| **FR-DAR-04** | The system shall support recording learning activities.                                             |
| **FR-DAR-05** | The system shall support recording play activities.                                                 |
| **FR-DAR-06** | The system shall support recording mood, behavior, and general observations.                        |
| **FR-DAR-07** | The system shall associate every daily report with the correct child and date.                      |
| **FR-DAR-08** | The system shall make the completed report available only to users authorized to view that child.   |

## 4.5 Health and Incident Reporting
| **ID**        | **Requirement**                                                                                                                                                                          |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-HIR-01** | The system shall allow authorized daycare staff to record a health observation for a child.                                                                                              |
| **FR-HIR-02** | The system shall allow authorized daycare staff to record an unusual incident involving a child.                                                                                         |
| **FR-HIR-03** | The system shall associate health and incident records with the correct child and date/time information.                                                                                 |
| **FR-HIR-04** | The system shall make health/incident information available only to authorized users.                                                                                                    |
| **FR-HIR-05** | The system shall support notifying or drawing the attention of the authorized parent/guardian to important health or incident information through the available communication mechanism. |
| **FR-HIR-06** | The system shall treat health and incident functionality as reporting only and shall not provide medical diagnosis.                                                                      |

## 4.6 Parent-Daycare Communication, Announcements and Alerts
| **ID**        | **Requirement**                                                                                                                                                                                          |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-COM-01** | The system shall support structured communication between authorized parents/guardians and daycare staff.                                                                                                |
| **FR-COM-02** | The system shall allow authorized administrators to publish announcements.                                                                                                                               |
| **FR-COM-03** | The system shall support reminders and important alerts.                                                                                                                                                 |
| **FR-COM-04** | The system shall display communication records to the intended authorized recipients.                                                                                                                    |
| **FR-COM-05** | The system shall maintain sufficient message/announcement information to support later viewing where the communication type requires history.                                                            |
| **FR-COM-06** | The system shall prevent a user from viewing private child-related communication that is not authorized for that user.                                                                                   |
| **FR-COM-07** | The first release shall support in-application communication/notification behavior even if paid SMS or other external notification services are not implemented.                                         |
| **FR-COM-08** | If activity-photo sharing is included in the final MVP, the system shall restrict each photograph to authorized child-related viewers. This requirement remains optional/TBD until advisor confirmation. |

## 4.7 Report Access, History and Administrative Monitoring
| **ID**        | **Requirement**                                                                                                                 |
|---------------|---------------------------------------------------------------------------------------------------------------------------------|
| **FR-RPT-01** | The system shall allow authorized parents/guardians to view current and previous reports for their linked child.                |
| **FR-RPT-02** | The system shall allow authorized users to view attendance history.                                                             |
| **FR-RPT-03** | The system shall allow authorized users to view relevant communication history.                                                 |
| **FR-RPT-04** | The system shall provide selected administrative summaries or monitoring views for daycare administrators.                      |
| **FR-RPT-05** | The system shall allow administrators to monitor completion of activity reporting according to the available reporting process. |
| **FR-RPT-06** | The system shall keep historical records logically linked to the correct child and user relationships.                          |

## 4.8 Centralized Database and Record Management
| **ID**       | **Requirement**                                                                                                                                                                                                                                                                                     |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-DB-01** | The system shall use a centralized structured database as the main persistent data source for the application.                                                                                                                                                                                      |
| **FR-DB-02** | The database shall store and relate user accounts, child profiles, guardian links, attendance, daily reports, health/incidents, communication records, events, products, stock, orders, payments, biometric verification references, and audit-related records required by the implemented modules. |
| **FR-DB-03** | The database shall assign unique identifiers to persistent records that require identity or relationships.                                                                                                                                                                                          |
| **FR-DB-04** | The system shall preserve referential integrity between related records such as parent-child links, child reports, orders/order items, and orders/payments.                                                                                                                                         |
| **FR-DB-05** | The system shall enforce data access through application permissions rather than exposing unrestricted database access to end users.                                                                                                                                                                |
| **FR-DB-06** | The system shall support creation of database backups as part of deployment and operational preparation.                                                                                                                                                                                            |
| **FR-DB-07** | The project shall test that a backup can be restored in the selected pilot/deployment environment.                                                                                                                                                                                                  |
| **FR-DB-08** | The system shall avoid deleting or overwriting related historical records in a way that creates broken relationships without an authorized and controlled operation.                                                                                                                                |
| **FR-DB-09** | The database shall associate operational entities (users, children, groups, staff duties, attendance, reports, health records, messages, announcements, events, products, orders, audit logs) with a mandatory `daycare_id` reference to maintain strict multi-tenant boundaries. |

## 4.9 AI Parent Guide
| **ID**       | **Requirement**                                                                                                                                                                                            |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-AI-01** | The system shall provide an AI Parent Guide interface to registered parents/guardians.                                                                                                                     |
| **FR-AI-02** | The system shall allow a parent/guardian to enter a natural-language question or request for general guidance.                                                                                             |
| **FR-AI-03** | The AI Parent Guide shall support general recommendations related to age-appropriate activities, meal ideas, outfit choices, daycare preparation, routines, and similar everyday parenting questions.      |
| **FR-AI-04** | Where relevant context is available and authorized, the AI Parent Guide may use the selected child's age, parent-provided restrictions/preferences, or daycare context to make the response more relevant. |
| **FR-AI-05** | The AI Parent Guide shall not intentionally provide medical diagnosis, treatment instructions, or professional psychological counseling.                                                                   |
| **FR-AI-06** | The AI Parent Guide shall clearly present itself as general informational guidance rather than a replacement for a qualified professional.                                                                 |
| **FR-AI-07** | The system shall not provide one family's child context to another parent/guardian when generating AI guidance.                                                                                            |
| **FR-AI-08** | The AI Parent Guide shall not automatically modify official child, health, attendance, or incident records based only on an AI response.                                                                   |
| **FR-AI-09** | If the external AI service is unavailable, the system shall keep core daycare communication, reporting, attendance, events, and e-commerce functions usable where their own dependencies are available.    |
| **FR-AI-10** | The exact AI provider, prompt/data-minimization design, and retention of AI interaction history shall be confirmed before implementation is baselined.                                                     |

## 4.10 Biometric Guardian Verification
| **ID**        | **Requirement**                                                                                                                                          |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-BIO-01** | The system shall support biometric enrollment for authorized adult parents/guardians used in the child-pickup process.                                   |
| **FR-BIO-02** | Biometric enrollment shall be performed by a daycare administrator or other daycare staff explicitly authorized for that function.                       |
| **FR-BIO-03** | The system shall link the biometric verification reference to the correct authorized adult guardian and the applicable child pickup authorization.       |
| **FR-BIO-04** | The system shall allow authorized daycare staff to initiate guardian verification during child pickup.                                                   |
| **FR-BIO-05** | The system shall indicate whether biometric verification succeeded or failed.                                                                            |
| **FR-BIO-06** | The system shall record the verification result and related checkout event in an audit-capable record when checkout is completed.                        |
| **FR-BIO-07** | The first version shall not enroll or identify children using biometric data.                                                                            |
| **FR-BIO-08** | The system shall provide a controlled manual guardian-verification alternative when biometric verification cannot be completed.                          |
| **FR-BIO-09** | Failure or temporary unavailability of the biometric device shall not remove the guardian's authorization record.                                        |
| **FR-BIO-10** | The exact biometric modality, device interface, and biometric-storage format shall remain TBD until hardware selection and privacy review are completed. |

## 4.11 Daycare E-commerce and Payment
| **ID**        | **Requirement**                                                                                                                                                                                                                                            |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-ECM-01** | The system shall allow an administrator to create and manage products supplied by the daycare.                                                                                                                                                             |
| **FR-ECM-02** | A product record shall include at least a product name, price, and availability/stock information required for ordering; additional display fields may be finalized during UI design.                                                                      |
| **FR-ECM-03** | The system shall allow parents/guardians to browse products currently offered by the daycare.                                                                                                                                                              |
| **FR-ECM-04** | The system shall allow a parent/guardian to add available products to a shopping cart and change quantities before placing an order.                                                                                                                       |
| **FR-ECM-05** | The system shall calculate the order total from the current product prices and selected quantities.                                                                                                                                                        |
| **FR-ECM-06** | The system shall create a unique order record when a parent/guardian confirms an order.                                                                                                                                                                    |
| **FR-ECM-07** | The system shall allow Pay at Daycare as an order payment option.                                                                                                                                                                                          |
| **FR-ECM-08** | Where an approved digital-payment gateway is available, the system shall allow the parent/guardian to initiate digital payment for an order.                                                                                                               |
| **FR-ECM-09** | The system shall not mark a digital-payment order as paid solely because the user returns to a success screen; the backend shall use the selected gateway's verification/callback mechanism before recording payment as successful.                        |
| **FR-ECM-10** | The system shall store a payment record linked to the corresponding order for digital payment and other recorded payment statuses.                                                                                                                         |
| **FR-ECM-11** | The system shall allow a parent/guardian to view the status and history of their own orders.                                                                                                                                                               |
| **FR-ECM-12** | The system shall allow administrators to review orders and update operational order status.                                                                                                                                                                |
| **FR-ECM-13** | The system shall prevent confirmed ordering beyond recorded available stock where stock is being enforced.                                                                                                                                                 |
| **FR-ECM-14** | The e-commerce module shall support only daycare-supplied products and shall not support third-party sellers.                                                                                                                                              |
| **FR-ECM-15** | The first version shall use daycare pickup/collection and shall not include home-delivery logistics.                                                                                                                                                       |
| **FR-ECM-16** | Proposed order statuses are Placed, Confirmed, Ready for Pickup, Collected, and Cancelled; proposed payment statuses are Unpaid, Pending, Paid, and Failed. These state names shall be confirmed with the advisor/daycare before implementation is frozen. |

## 4.12 Simple Events Calendar
| **ID**        | **Requirement**                                                                                                              |
|---------------|------------------------------------------------------------------------------------------------------------------------------|
| **FR-EVT-01** | The system shall allow an administrator to create a daycare event.                                                           |
| **FR-EVT-02** | An event shall contain at least a title and date; time, description, and event type may be recorded where applicable.        |
| **FR-EVT-03** | The system shall allow an administrator to edit an existing event.                                                           |
| **FR-EVT-04** | The system shall allow an administrator to remove/cancel an event according to the selected record-management approach.      |
| **FR-EVT-05** | The system shall allow parents/guardians to view upcoming daycare events.                                                    |
| **FR-EVT-06** | The system shall support a simple calendar view or event-list view.                                                          |
| **FR-EVT-07** | The event feature shall support items such as holidays, parent meetings, activity days, special programs, and closing dates. |

## 4.13 Audit and Accountability Requirements
| **ID**        | **Requirement**                                                                                                                                |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| **FR-AUD-01** | The system shall record audit-related information for security-sensitive or accountability-sensitive operations selected during design.        |
| **FR-AUD-02** | Audit information shall include sufficient context to identify the action, affected record, user or actor, and relevant time where applicable. |
| **FR-AUD-03** | Guardian verification and child checkout shall be included among the actions considered for audit recording.                                   |
| **FR-AUD-04** | Administrative changes to sensitive relationships such as parent-child links shall be traceable where practical.                               |
| **FR-AUD-05** | Audit records shall not be exposed to ordinary parents/guardians unless a specific user-facing history is intentionally provided.              |

# 5. External Interface Requirements
## 5.1 User Interface Requirements
| **ID**    | **Requirement**                                                                                                                    |
|-----------|------------------------------------------------------------------------------------------------------------------------------------|
| **UI-01** | The system shall provide role-appropriate dashboards or navigation for administrators, caregivers/teachers, and parents/guardians. |
| **UI-02** | The interface shall be responsive so that primary functions remain usable on common mobile and desktop screen sizes.               |
| **UI-03** | Forms used for frequent daycare tasks such as attendance and daily reports shall use clear labels and avoid unnecessary steps.     |
| **UI-04** | The parent interface shall make linked-child information clear enough to reduce the risk of acting on the wrong child.             |
| **UI-05** | The pickup-verification interface shall clearly display the selected child and authorized guardian before checkout is confirmed.   |
| **UI-06** | The store interface shall clearly show product name, price, availability, cart total, payment choice, and order status.            |
| **UI-07** | The AI Parent Guide interface shall distinguish AI-generated guidance from official daycare reports.                               |
| **UI-08** | The events interface shall support a simple calendar or event-list presentation of upcoming events.                                |

## 5.2 Hardware Interface Requirements
| **ID**    | **Requirement**                                                                                                                                        |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| **HW-01** | The biometric module shall interface with a compatible adult biometric device or supported platform capability selected by the project team.           |
| **HW-02** | The exact biometric sensor type, driver/API, and enrollment method are TBD until device selection.                                                     |
| **HW-03** | The core application shall not require biometric hardware for ordinary parent report viewing, caregiver reporting, or administrator record management. |

## 5.3 Software and Service Interface Requirements
| **ID**    | **Requirement**                                                                                                                                                      |
|-----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **SI-01** | The proposed implementation shall use PostgreSQL as the centralized relational database unless the project team and advisor approve a change.                        |
| **SI-02** | The proposed implementation shall use a React frontend and Node.js/Express backend unless refined during design with advisor approval.                               |
| **SI-03** | The AI Parent Guide may connect to a selected AI API/service; the provider and data-sharing policy are TBD.                                                          |
| **SI-04** | Digital payment shall connect to an approved Ethiopian payment gateway if live/sandbox access is available. Chapa is a candidate identified in the updated proposal. |
| **SI-05** | Payment integration shall support server-side verification or callback/webhook processing before payment status is finalized.                                        |
| **SI-06** | External-service credentials and secret keys shall be kept on the server side and shall not be exposed in client-side code.                                          |

## 5.4 Communication Interface Requirements
| **ID**    | **Requirement**                                                                                                                                               |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **CI-01** | Client-server communication carrying authentication or sensitive application data shall use an encrypted transport mechanism in the deployed environment.     |
| **CI-02** | The application shall handle temporary loss of connectivity by showing an understandable error and preventing duplicate submissions where practical.          |
| **CI-03** | External AI and payment calls shall be treated as dependent services; failure of one external service shall not unnecessarily disable unrelated core modules. |

# 6. Data Requirements
## 6.1 Main Data Entities
| **Entity / Data Area**               | **Purpose**                                                                                                                  |
|--------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| User                                 | Authentication account, role, account status, and profile information required by the application.                           |
| Child                                | Basic child profile and internal identifier.                                                                                 |
| Parent/Guardian Link                 | Relationship between a child and an authorized parent/guardian, including pickup authorization where applicable.             |
| Emergency Contact / Care Instruction | Emergency contact and relevant daycare care information associated with a child.                                             |
| Group / Class / Caregiver Assignment | Grouping or responsibility relationship used by the daycare.                                                                 |
| Attendance                           | Check-in, check-out, absence, date/time, and related actor information.                                                      |
| Daily Report                         | Daily child report containing meal, sleep, activity, mood/behavior, and general observation information.                     |
| Health Observation / Incident        | Reported health observation or unusual incident associated with a child.                                                     |
| Message / Announcement / Alert       | Parent-daycare communication and general or targeted notices.                                                                |
| Activity Photograph (optional)       | Authorized activity photograph if this optional feature is confirmed for MVP.                                                |
| Event                                | Daycare holiday, meeting, activity day, special program, closing date, or similar event.                                     |
| Biometric Verification Reference     | Adult guardian verification reference/identifier required by the selected biometric technology; exact storage format is TBD. |
| Guardian Verification Event          | Result and context of an adult guardian verification performed during pickup.                                                |
| Product                              | Daycare-supplied product, price, description/category information if used, and availability.                                 |
| Stock                                | Basic quantity/availability information for daycare products.                                                                |
| Order                                | Parent/guardian order, total, payment status, operational status, and timestamps.                                            |
| Order Item                           | Product and quantity contained in an order.                                                                                  |
| Payment                              | Payment method/status, order link, and gateway/reference information where applicable.                                       |
| Audit Record                         | Selected security/accountability action record containing actor, action, target, and time information.                       |

## 6.2 Data Integrity Rules
- Each child-related operational record shall reference the correct child record.

- A parent/guardian shall view a child only through an authorized relationship recorded by the system.

- Order items shall reference valid products and their parent order.

- Payment records shall reference the order to which the payment belongs.

- Biometric verification references shall be associated with the correct authorized adult guardian.

- The system shall prevent orphaned or inconsistent relationships through database/application controls appropriate to the chosen design.

- The system shall validate required data before accepting a record as complete.

## 6.3 Data Privacy and Sensitivity
- Child information, contact information, health/incident observations, and guardian biometric information shall be treated as sensitive project data.

- Only the minimum data required for the implemented feature should be collected and displayed.

- The first version shall not collect child biometrics.

- Real sensitive records should be limited during development/testing; sample or anonymized data should be used where appropriate, consistent with the proposal.

- Exact retention and deletion periods are TBD and require advisor/daycare policy confirmation.

## 6.4 Backup and Recovery
- The deployment plan shall include a database backup procedure.

- The project shall demonstrate that the selected backup can be restored in the pilot/test environment.

- Backup access shall be restricted to authorized technical/administrative personnel.

- The final backup frequency and retention period are TBD for the selected deployment environment.

# 7. Non-Functional Requirements
## 7.1 Security
| **ID**         | **Requirement**                                                                                                                |
|----------------|--------------------------------------------------------------------------------------------------------------------------------|
| **NFR-SEC-01** | Protected functions and records shall require authentication and authorization.                                                |
| **NFR-SEC-02** | Authorization checks shall be enforced at the server/application level and shall not depend only on hiding interface elements. |
| **NFR-SEC-03** | Passwords shall not be stored as readable plain text.                                                                          |
| **NFR-SEC-04** | The system shall validate and safely handle user input to reduce common injection and script-related risks.                    |
| **NFR-SEC-05** | Secret credentials for AI, payment, or other external services shall not be embedded in client-side code.                      |
| **NFR-SEC-06** | Security-sensitive actions identified in Section 4.13 shall be auditable.                                                      |
| **NFR-SEC-07** | The system shall end or reject invalid/expired sessions according to the selected authentication design.                       |

## 7.2 Privacy
| **ID**         | **Requirement**                                                                                                                                                               |
|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-PRV-01** | Parents/guardians shall have access only to data they are authorized to view.                                                                                                 |
| **NFR-PRV-02** | The system shall minimize unnecessary exposure of child, contact, health/incident, and biometric information in screens and logs.                                             |
| **NFR-PRV-03** | Biometric information shall be processed only for the authorized adult guardian-verification purpose defined in this SRS.                                                     |
| **NFR-PRV-04** | The project shall use consent/authorization procedures for sensitive pilot data according to daycare policy and applicable Ethiopian requirements referenced by the proposal. |
| **NFR-PRV-05** | The data sent to an external AI service, if any, shall be limited to the information required for the parent's request; the exact minimization design is TBD.                 |

## 7.3 Reliability and Data Integrity
| **ID**         | **Requirement**                                                                                                                               |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-REL-01** | A successfully saved core record shall remain available unless changed through an authorized operation.                                       |
| **NFR-REL-02** | The system shall avoid duplicate record creation caused by repeated submission where practical for attendance, reports, orders, and payments. |
| **NFR-REL-03** | Payment and order data shall remain consistent when payment is pending, successful, failed, or retried.                                       |
| **NFR-REL-04** | Failure of AI or digital-payment integration shall not corrupt unrelated child or communication records.                                      |

## 7.4 Usability
| **ID**         | **Requirement**                                                                                                                           |
|----------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-USA-01** | Common parent and caregiver tasks shall use clear wording and a small, understandable number of steps.                                    |
| **NFR-USA-02** | The interface shall clearly identify the selected child before a child-specific report, attendance action, or pickup action is submitted. |
| **NFR-USA-03** | Validation errors shall explain what the user needs to correct without exposing sensitive technical details.                              |
| **NFR-USA-04** | The application shall provide a responsive layout appropriate for the phone-based usage expected in the project context.                  |

## 7.5 Performance
| **ID**          | **Requirement**                                                                                                                                      |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-PERF-01** | The system shall remain responsive for the expected pilot daycare workload during normal operations.                                                 |
| **NFR-PERF-02** | Database queries used for common pages such as child reports, attendance history, products, and events shall be designed to avoid unnecessary delay. |
| **NFR-PERF-03** | The measurable response-time and concurrent-user acceptance targets are TBD and shall be agreed after requirements elicitation/pilot planning.       |

## 7.6 Availability and Graceful Degradation
| **ID**         | **Requirement**                                                                                                               |
|----------------|-------------------------------------------------------------------------------------------------------------------------------|
| **NFR-AVL-01** | Temporary unavailability of the AI service shall not prevent ordinary reporting, attendance, communication, or event viewing. |
| **NFR-AVL-02** | Temporary unavailability of the digital-payment service shall not remove Pay at Daycare as an available order workflow.       |
| **NFR-AVL-03** | Temporary biometric-device failure shall allow the controlled manual guardian-verification fallback defined by the daycare.   |

## 7.7 Maintainability
| **ID**         | **Requirement**                                                                                                                                                                               |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-MNT-01** | The application shall be organized into maintainable modules for authentication, child management, reporting, communication, AI, biometric verification, e-commerce, events, and data access. |
| **NFR-MNT-02** | Source code shall be maintained under version control as defined in the project proposal.                                                                                                     |
| **NFR-MNT-03** | Important errors and integration failures shall be logged sufficiently for troubleshooting without unnecessarily exposing sensitive data.                                                     |

## 7.8 Compatibility and Accessibility
| **ID**         | **Requirement**                                                                                                                    |
|----------------|------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-CMP-01** | The responsive web interface shall be tested on common modern desktop and mobile browsers selected for the project pilot.          |
| **NFR-CMP-02** | The interface should follow relevant WCAG 2.2 accessibility principles referenced by the proposal where practical for the project. |
| **NFR-CMP-03** | Exact supported browser versions and any minimum device requirements are TBD for the final deployment specification.               |

## 7.9 Testability
| **ID**         | **Requirement**                                                                                                                                          |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **NFR-TST-01** | Each mandatory functional requirement shall be traceable to one or more verification activities or test cases.                                           |
| **NFR-TST-02** | The project shall support test accounts and non-production test data for each main role.                                                                 |
| **NFR-TST-03** | External payment integration shall support sandbox/test operation when provided by the selected gateway.                                                 |
| **NFR-TST-04** | Biometric verification shall be testable for success, failure, unauthorized guardian, device failure, and manual fallback scenarios.                     |
| **NFR-TST-05** | AI guidance shall be testable for relevant answers, out-of-scope medical/psychological requests, authorization boundaries, and external-service failure. |

# 8. Detailed Use Case Specifications
The following use cases describe the main success path and important alternatives. They are intentionally focused on the first-release scope. Lower-level screen behavior and database implementation details belong to the later design documents.

### 8.1 UC-01 Authenticate User
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Administrator, Caregiver/Teacher, Parent/Guardian</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>A registered active account exists.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>The user submits login credentials.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. User opens the login interface.<br />
2. User enters the required credentials.<br />
3. System validates the credentials and account status.<br />
4. System creates an authenticated session.<br />
5. System opens the interface allowed for the user role.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Invalid credentials: system rejects the login and shows a non-sensitive error message.<br />
A2. Disabled/inactive account: system denies access.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>The user is authenticated and can access only authorized functions, or access is denied without creating a valid session.</td>
</tr>
</tbody>
</table>

### 8.2 UC-03 Manage Child Profile
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Daycare Administrator</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Administrator is authenticated with child-management permission.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Administrator chooses to create or edit a child profile.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Administrator opens child management.<br />
2. Administrator enters or updates basic child data.<br />
3. Administrator records emergency contact and relevant care instructions where required.<br />
4. Administrator assigns the child to a caregiver/group if applicable.<br />
5. System validates required data.<br />
6. System saves the child profile.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Missing or invalid required data: system asks for correction and does not save an invalid complete record.<br />
A2. Unauthorized user: system denies the operation.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>A valid child profile exists or the authorized changes are stored.</td>
</tr>
</tbody>
</table>

### 8.3 UC-04 Link Parent/Guardian to Child
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Daycare Administrator</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Child and parent/guardian records exist.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Administrator chooses to add or change a child-parent/guardian relationship.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Administrator opens the child profile.<br />
2. Administrator selects the adult parent/guardian record.<br />
3. Administrator identifies the relationship/pickup authorization information required by daycare policy.<br />
4. System displays the child and adult information for confirmation.<br />
5. Administrator confirms the relationship.<br />
6. System stores the authorized link.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Wrong or duplicate relationship detected: administrator cancels or corrects before confirmation.<br />
A2. Unauthorized user: system denies the change.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>The child-parent/guardian relationship is stored and becomes the basis for authorized parent access and, where applicable, pickup authorization.</td>
</tr>
</tbody>
</table>

### 8.4 UC-05 Record Attendance
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Daycare Administrator or Caregiver/Teacher</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>User is authenticated and permitted to access the selected child.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Staff records check-in, check-out, or absence.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Staff selects the child.<br />
2. System displays the child identity and relevant current attendance state.<br />
3. Staff selects check-in, check-out, or absence.<br />
4. System validates that the requested attendance transition is allowed.<br />
5. For checkout, the required guardian verification/fallback is completed if configured.<br />
6. System stores the attendance event and time information.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Duplicate/conflicting state: system rejects or requires correction.<br />
A2. Checkout guardian cannot be verified biometrically: controlled manual fallback may be used by authorized staff.<br />
A3. Unauthorized child: system denies the action.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>Attendance history is updated with a valid event.</td>
</tr>
</tbody>
</table>

### 8.5 UC-06 Create Daily Activity Report
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Caregiver / Teacher</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Caregiver is authenticated and permitted to report for the child.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Caregiver starts a daily report.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Caregiver selects the child and date.<br />
2. System displays the selected child clearly.<br />
3. Caregiver records relevant meals/snacks, sleep/rest, learning/play activities, mood/behavior, and observations.<br />
4. System validates required information.<br />
5. Caregiver submits the report.<br />
6. System stores the report and makes it available to authorized viewers.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Required information is missing: system requests correction.<br />
A2. Unauthorized child: system denies report creation.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>A daily report linked to the correct child and date is stored and available to authorized users.</td>
</tr>
</tbody>
</table>

### 8.6 UC-07 Record Health / Incident Information
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Caregiver/Teacher or Administrator</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>User is authenticated and permitted to access the child.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>A health observation or unusual incident needs to be recorded.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. User selects the child.<br />
2. User chooses health observation or incident reporting.<br />
3. User enters the available factual observation/incident information.<br />
4. System validates required fields.<br />
5. User submits the record.<br />
6. System stores the record and makes it available to authorized parent/guardian and daycare users as permitted.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. The user attempts to enter a diagnosis generated by the system: Ankelba does not provide diagnosis functionality.<br />
A2. Unauthorized user: access is denied.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>The factual observation/incident record is stored for authorized viewing and follow-up communication.</td>
</tr>
</tbody>
</table>

### 8.7 UC-09 Communicate / Publish Announcement or Alert
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Administrator, Caregiver/Teacher, Parent/Guardian</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>User is authenticated.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>User opens an allowed communication function.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. User selects the permitted message/announcement/alert function.<br />
2. User selects the intended recipient or audience where required.<br />
3. User enters the message content.<br />
4. System validates the action against the user role.<br />
5. System stores/sends the communication within the supported channel.<br />
6. Intended recipients can view the communication.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. User selects an unauthorized recipient/child context: system denies the action.<br />
A2. External notification delivery is unavailable: in-app communication remains available where implemented.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>The authorized communication is recorded/delivered through the supported mechanism.</td>
</tr>
</tbody>
</table>

### 8.8 UC-10 Use AI Parent Guide
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Parent / Guardian</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Parent is authenticated. Any child context used is authorized for that parent.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Parent asks Ankelba for general guidance.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Parent opens the AI Parent Guide.<br />
2. Parent selects the relevant linked child if the guidance is child-specific.<br />
3. Parent enters a question or request.<br />
4. System prepares only the appropriate authorized context needed for the request.<br />
5. AI service generates a response.<br />
6. System displays the response as general informational guidance.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Medical diagnosis/treatment or professional psychological counseling request: AI response must stay within the non-medical/general-guidance boundary.<br />
A2. AI service unavailable: system shows an understandable service-unavailable message; core Ankelba functions remain usable.<br />
A3. Parent attempts to use another child's context: system denies access.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>The parent receives general guidance without changing official daycare records.</td>
</tr>
</tbody>
</table>

### 8.9 UC-11 Enroll Authorized Guardian Biometric
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Daycare Administrator / explicitly authorized staff</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Adult guardian is already authorized for the applicable child; consent/authorization process required by daycare policy is completed.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Staff chooses to enroll the adult for biometric pickup verification.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Staff opens the authorized guardian record.<br />
2. System displays guardian and linked child information.<br />
3. Staff starts biometric enrollment using the selected device/platform.<br />
4. The biometric device/platform creates the required verification reference.<br />
5. System links the verification reference to the correct adult guardian.<br />
6. System records the enrollment action as required for accountability.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Device/enrollment failure: no valid biometric reference is activated; staff may retry later.<br />
A2. Adult is not authorized for pickup: enrollment is not completed.<br />
A3. Child biometric is selected/attempted: the first-release design does not allow child biometric enrollment.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>An adult guardian has a valid verification reference linked to the authorized pickup relationship, or enrollment remains incomplete.</td>
</tr>
</tbody>
</table>

### 8.10 UC-12 Verify Guardian and Complete Pickup
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Daycare Administrator / explicitly authorized staff</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Child is present/checked in; adult is recorded as an authorized pickup guardian.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Authorized adult arrives to collect the child.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Staff selects the child and intended guardian.<br />
2. System displays the child and guardian information.<br />
3. Staff initiates biometric verification.<br />
4. Device/platform returns a verification result.<br />
5. If verified, staff confirms child checkout.<br />
6. System records checkout and verification/audit information.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Verification fails: checkout is not completed through the biometric path.<br />
A2. Device unavailable or guardian cannot complete biometric verification: authorized staff follows the controlled manual verification procedure and records the checkout accordingly.<br />
A3. Adult is not an authorized guardian: system does not approve checkout based on that adult.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>Child checkout is recorded only after an authorized verification path is completed.</td>
</tr>
</tbody>
</table>

### 8.11 UC-14 Place Daycare Store Order
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Parent / Guardian</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Parent is authenticated; products are available in the daycare store.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Parent chooses to order daycare-supplied products.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Parent opens the daycare store.<br />
2. Parent browses available products.<br />
3. Parent adds products and quantities to the cart.<br />
4. System calculates the total.<br />
5. Parent reviews the cart and confirms the order.<br />
6. System creates an order and presents the available payment options.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Requested quantity exceeds available stock: system prevents confirmation or asks the parent to reduce quantity.<br />
A2. Product becomes unavailable before confirmation: system updates/rejects the unavailable item.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>A unique order exists with the selected products, quantities, total, payment status, and operational status.</td>
</tr>
</tbody>
</table>

### 8.12 UC-15 Make / Record Payment
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Parent / Guardian; System; Payment Gateway</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>An order exists.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Parent chooses Pay at Daycare or an available digital-payment method.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Parent selects the payment method.<br />
2. For Pay at Daycare, system records the order as awaiting/using daycare payment according to the confirmed state model.<br />
3. For digital payment, Ankelba backend creates a payment request with the approved gateway.<br />
4. Parent completes payment through the gateway interface.<br />
5. Gateway sends/returns payment status information to Ankelba.<br />
6. Ankelba verifies the transaction using the supported backend verification mechanism.<br />
7. Only after successful verification does Ankelba record the payment as Paid.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Payment fails or is cancelled: system keeps the order unpaid/failed according to the selected state model.<br />
A2. User returns to Ankelba without verified payment: system does not mark the order Paid.<br />
A3. Gateway unavailable: parent may retry later or use Pay at Daycare.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>Payment status is recorded accurately and remains linked to the order.</td>
</tr>
</tbody>
</table>

### 8.13 UC-16 Manage Order
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Daycare Administrator</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>Administrator is authenticated and an order exists.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Administrator opens order management.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Administrator views new/current orders.<br />
2. Administrator opens an order.<br />
3. System displays items, total, payment status, and current operational status.<br />
4. Administrator updates the operational status as the order is processed.<br />
5. System stores the update.<br />
6. Parent can view the updated order status.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Administrator attempts an invalid status transition: system rejects it if transition rules are enforced.<br />
A2. Digital payment is not verified: system must not display it as Paid.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>The order reflects the current daycare processing state.</td>
</tr>
</tbody>
</table>

### 8.14 UC-17 Manage / View Events
<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Primary Actor(s)</strong></th>
<th>Administrator; Parent/Guardian</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Preconditions</strong></td>
<td>User is authenticated.</td>
</tr>
<tr class="even">
<td><strong>Trigger</strong></td>
<td>Administrator manages an event or parent views upcoming events.</td>
</tr>
<tr class="odd">
<td><strong>Main Success Flow</strong></td>
<td>1. Administrator creates an event with required title/date and optional details.<br />
2. System validates and stores the event.<br />
3. Parents/guardians open the calendar/event list.<br />
4. System displays upcoming events.<br />
5. Administrator may later edit or cancel/remove the event according to the selected record approach.</td>
</tr>
<tr class="even">
<td><strong>Alternative / Exception Flows</strong></td>
<td>A1. Invalid/missing event date or title: system requests correction.<br />
A2. Parent attempts to create/edit an event: system denies the operation.</td>
</tr>
<tr class="odd">
<td><strong>Postconditions</strong></td>
<td>Authorized users see the current event information; administrative changes are stored.</td>
</tr>
</tbody>
</table>

# 9. Business Rules
| **ID**    | **Requirement**                                                                                                                         |
|-----------|-----------------------------------------------------------------------------------------------------------------------------------------|
| **BR-01** | A parent/guardian may view child-specific information only for a child linked to that user.                                             |
| **BR-02** | Only authorized daycare users may create or modify official child attendance, daily reports, health observations, or incident records.  |
| **BR-03** | Health/incident functionality is for reporting and communication, not medical diagnosis.                                                |
| **BR-04** | The first release shall not enroll children for biometric identification.                                                               |
| **BR-05** | An adult must be recorded as an authorized guardian before biometric pickup verification can be used for that adult-child relationship. |
| **BR-06** | Biometric verification is an additional control; a controlled manual verification fallback must exist.                                  |
| **BR-07** | AI Parent Guide responses are general recommendations and shall not become official child records automatically.                        |
| **BR-08** | The daycare store sells only products supplied by the daycare; it is not a third-party marketplace.                                     |
| **BR-09** | The first-release e-commerce workflow does not include home delivery.                                                                   |
| **BR-10** | Pay at Daycare shall remain available when digital payment is unavailable.                                                              |
| **BR-11** | A digital payment shall be considered Paid only after backend verification through the selected payment gateway.                        |
| **BR-12** | Confirmed orders shall not exceed the stock/availability rules enforced by the system.                                                  |
| **BR-13** | Only authorized administrators may create or change daycare events and product master data.                                             |
| **BR-14** | Sensitive records and relationships shall be protected by role-based access and the applicable authorization rules.                     |

# 10. Requirements Traceability
The following matrix links the updated proposal objectives to the main SRS requirement groups. Individual test-case traceability will be created during the testing phase.

| **Objective** | **Proposal Objective Summary**                                                                    | **SRS Coverage**                                           |
|---------------|---------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| OBJ-01        | Study existing communication/reporting practices                                                  | Requirements elicitation activity; not a software function |
| OBJ-02        | Identify functional and non-functional requirements                                               | Sections 4 and 7                                           |
| OBJ-03        | Design centralized database                                                                       | FR-DB-\*; Section 6                                        |
| OBJ-04        | Secure authentication and role-based access                                                       | FR-UAM-\*; NFR-SEC-\*; NFR-PRV-\*                          |
| OBJ-05        | Record attendance and daily child activities/observations/incidents                               | FR-ATT-\*; FR-DAR-\*; FR-HIR-\*                            |
| OBJ-06        | Parent report access, announcements, alerts, communication                                        | FR-COM-\*; FR-RPT-\*                                       |
| OBJ-07        | Administrative management and monitoring                                                          | FR-UAM-\*; FR-CH-\*; FR-RPT-\*; FR-AUD-\*                  |
| OBJ-08        | AI Parent Guide                                                                                   | FR-AI-\*; NFR-PRV-\*; NFR-TST-05                           |
| OBJ-09        | Biometric guardian verification                                                                   | FR-BIO-\*; FR-ATT-07; NFR-TST-04                           |
| OBJ-10        | Daycare e-commerce                                                                                | FR-ECM-\*; SI-04 to SI-06                                  |
| OBJ-11        | Simple events calendar                                                                            | FR-EVT-\*                                                  |
| OBJ-12        | Test functionality, usability, security, reliability, database, AI, biometric, e-commerce, events | NFR-TST-\* and all requirement groups                      |

# 11. Acceptance and Validation Criteria
The first-release system will be considered ready for final project evaluation when the mandatory requirements selected for the MVP have been implemented and verified, the critical access/privacy rules are satisfied, and the system can demonstrate the main end-to-end daycare workflows. Exact quantitative performance targets and any TBD items must be resolved or formally documented before final acceptance.

| **ID**    | **Requirement**                                                                                                                                                              |
|-----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **AC-01** | Administrator, caregiver/teacher, and parent/guardian accounts can authenticate and are restricted to their permitted functions.                                             |
| **AC-02** | A child can be registered and linked to the correct authorized parent/guardian without exposing another child's information.                                                 |
| **AC-03** | Authorized daycare staff can record check-in/check-out/absence and authorized users can view attendance history.                                                             |
| **AC-04** | Caregivers can create a daily activity report and the correct parent/guardian can view it.                                                                                   |
| **AC-05** | Health/incident information can be recorded and communicated without the system presenting medical diagnosis.                                                                |
| **AC-06** | Announcements/messages/alerts can be recorded and viewed by the intended authorized users.                                                                                   |
| **AC-07** | The central database maintains correct relationships for users, children, reports, events, biometric references, products, orders, and payments implemented in the MVP.      |
| **AC-08** | AI Parent Guide returns general guidance for supported everyday topics and handles out-of-scope medical/psychological requests within its defined limits.                    |
| **AC-09** | An authorized adult guardian can be biometrically verified during pickup, and the controlled manual fallback can be demonstrated when biometric verification is unavailable. |
| **AC-10** | A parent can browse daycare products, create an order, choose Pay at Daycare or the available digital-payment option, and view order status.                                 |
| **AC-11** | A digital-payment order is marked Paid only after verified gateway confirmation in the implemented integration or sandbox demonstration.                                     |
| **AC-12** | An administrator can create an event and a parent/guardian can view it in the simple calendar/event list.                                                                    |
| **AC-13** | A backup and restore procedure for the selected database environment is demonstrated.                                                                                        |
| **AC-14** | No unresolved critical defect is known that allows unauthorized child-data access, incorrect guardian authorization, or false digital-payment confirmation.                  |

# Appendix A. Advisor Review Checklist
This checklist is included to make the next advisor meeting productive. Items checked or corrected after the meeting can be used to create the next SRS revision.

- Confirm the final user roles and caregiver/group access rules.

- Confirm whether activity photographs are required in the first release.

- Confirm whether first-release notifications are in-app only or include another channel.

- Confirm the biometric device/modality to be demonstrated.

- Confirm the manual guardian-verification fallback procedure.

- Confirm the AI provider and what child context may be sent to it.

- Confirm the digital-payment gateway and whether the defense requires live money transfer or sandbox verification.

- Confirm the order-status names and stock-update rule.

- Confirm data-retention expectations for child, biometric, AI, and e-commerce records.

- Confirm measurable performance expectations for the selected daycare pilot.

- Confirm whether any SRS requirement should be deferred to a later release.

# Appendix B. Proposed Verification Methods
| **Verification Method**         | **Applicable Areas**                                                                                     |
|---------------------------------|----------------------------------------------------------------------------------------------------------|
| Requirements / design review    | Purpose, scope, roles, business rules, data model, TBD decisions                                         |
| Functional test                 | Authentication, profiles, attendance, reports, communication, events, store, order handling              |
| Security / authorization test   | Parent-child isolation, admin restrictions, sensitive record access, direct unauthorized access attempts |
| Integration test                | Database relations, AI API, biometric interface, payment gateway, order/payment consistency              |
| Usability test                  | Parent, caregiver, and administrator workflows on mobile/desktop                                         |
| User acceptance / demonstration | End-to-end workflows with representative users or project examiners                                      |

**End of Software Requirements Specification - Version 1.2**


## Implementation clarification — 3 October 2026

The user confirmed that the admin interface is web-based and that caregivers/daycare staff assigned to front-desk duty sign in with their own staff credentials to record attendance, verify authorized adult guardians, and complete pickups. “Guardian” remains the adult pickup designation; it does not grant staff authority. This clarifies sections 2.4–2.5, FR-UAM-01–03, FR-ATT-01–07 and FR-BIO-01–10.

- **FR-DESK-01:** An administrator can assign and revoke front-desk duty for a specified date/shift and record scope.
- **FR-DESK-02:** Assigned staff use the web workspace under their own authenticated identity; duty does not grant full admin access.
- **FR-DESK-03:** The server enforces active duty, permitted actions and child/group scope on every attendance and pickup operation. Teaching assignments and desk assignments are separate.
- **FR-DESK-04:** Verification, fallback and checkout retain the selected child/adult, staff actor, result and timestamps in audit-capable records. The existing verification-before-checkout requirement remains mandatory for the configured pickup workflow.
- **UI-DESK-01:** The admin and staff web interfaces share the approved parent app logo, typography, colors, cards and background treatment, with responsive desktop navigation and detailed operational views.

These are requirements, not a statement that the current backend implements shift assignments. Detailed scope, acceptance checks and open policy/device decisions are tracked in [DELIVERY_PLAN.md](DELIVERY_PLAN.md).

## Practical SaaS journey clarification — 25 October 2026

The approved direction focuses on functional project workflows. Brightwheel's public onboarding and daily-care guidance are references; Ankelba retains its own scope and staff-controlled guardian verification. This clarification supersedes treating “Trial” as a package alongside Standard/Premium and the older blueprint's subscription-billing deferral for the manual workflows below.

| ID | Requirement |
| --- | --- |
| FR-SUB-01 | Prospective daycares shall compare available packages, capacity, billing period, renewal price and included free-trial terms before applying. Prices not configured by an operator shall be explicitly identified; the system shall not invent commercial prices. |
| FR-SUB-02 | Registration shall retain the selected package and a versioned snapshot of its terms. A stale catalog selection shall require review before submission. |
| FR-SUB-03 | Approval shall start the selected package's accepted free trial without silently substituting another package. Trial phase and daycare approval/suspension shall be distinct from the package name. |
| FR-SUB-04 | Applicants shall check application status using their submitted administrator credentials. Public customer pages shall not direct applicants to the internal operator console. |
| FR-SUB-05 | Platform operators shall use a dedicated login entry and browser session storage. Server authorization shall continue to restrict operator actions; a separate URL alone is not an access control. |
| FR-SUB-06 | Authorized operators shall configure future package offers and manage trial extension, agreed package changes, cancellation, resumption and manually confirmed renewal with reasons, concurrency checks and attributable history. |
| FR-SUB-07 | Manual renewal shall match the accepted amount and record a unique receipt/payment reference. Repeating the same successful request shall not create a second renewal. No automatic charge or gateway verification shall be implied. Subscription collection is separate from parent store orders and daycare tuition. |
| FR-SUB-08 | Daycare administrators shall see only their own package terms, dates and subscription history. Guided center setup shall derive progress from saved center, classroom, staff, family, assignment and current-duty records. |
| FR-SUB-09 | For the project pilot, expired/cancelled subscription state shall be displayed for renewal review without abruptly preventing child care or safe pickup. This is an explicit pilot policy, not automatic paid-access enforcement. |

The implementation and verification scope is documented in [PRACTICAL_SAAS_IMPLEMENTATION.md](docs/PRACTICAL_SAAS_IMPLEMENTATION.md). External invitation-mail delivery and automated recurring payment collection are separate integrations. This clarification does not waive the earlier biometric, privacy, backup-restore or other unresolved acceptance requirements.
