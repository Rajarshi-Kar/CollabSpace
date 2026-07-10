# Problem Statement

Modern software teams rely on numerous disconnected tools to collaborate throughout the software development lifecycle.

Documentation lives in Notion.

Tasks are tracked in Jira.

Team discussions happen in Slack.

Files are shared through Google Drive.

Meeting notes are scattered across multiple platforms.

This fragmentation introduces unnecessary context switching, duplicated information, inconsistent permissions, and poor visibility across projects.

Although many collaboration platforms exist, relatively few demonstrate how real-time collaborative systems are engineered internally. Building such systems requires solving challenging problems involving concurrent editing, synchronization, distributed state management, conflict resolution, real-time messaging, permissions, search, notifications, and scalable backend architecture.

---

# Objective

Design and develop a production-inspired collaborative workspace platform that enables teams to manage projects, documents, discussions, tasks, and shared knowledge within a unified application.

The platform should support multiple organizations, collaborative workspaces, real-time document editing, project management, messaging, notifications, and file sharing while maintaining consistency, scalability, and security.

Rather than focusing solely on features, the project aims to demonstrate how modern collaboration platforms coordinate distributed clients, synchronize shared state, and provide responsive user experiences under concurrent usage.

---

# Goals

Build a unified collaboration platform capable of:

- Managing organizations and teams.
- Creating collaborative workspaces.
- Supporting concurrent document editing.
- Organizing projects and tasks.
- Providing real-time communication.
- Managing files and attachments.
- Maintaining complete activity history.
- Delivering notifications across devices.
- Enforcing fine-grained permissions.
- Providing fast search across all workspace content.

---

# Core Functionalities

## Organization Management

Organizations

Teams

Members

Invitations

Roles

Permission Groups

Workspace Management

Audit Logs

---

## Collaborative Documents

Rich Text Editor

Real-Time Editing

Conflict Resolution

Version History

Comments

Mentions

Document Templates

Document Sharing

Nested Pages

---

## Project Management

Projects

Tasks

Kanban Boards

Lists

Milestones

Priorities

Labels

Assignments

Deadlines

Dependencies

Sprint Planning

---

## Team Communication

Channels

Direct Messages

Threaded Conversations

Message Reactions

File Sharing

Mentions

Read Receipts

Typing Indicators

Pinned Messages

---

## File Management

Folders

Attachments

Drag-and-Drop Uploads

Versioned Files

Preview Support

Download History

Storage Quotas

---

## Search

Global Search

Full Text Search

Filters

Tag Search

People Search

Document Search

Task Search

File Search

Recent Searches

---

## Notifications

Real-Time Notifications

Email Notifications

Mention Alerts

Task Reminders

Comment Notifications

Activity Feed

---

## Workspace Analytics

Project Progress

Task Completion

Team Activity

Document Activity

Storage Usage

User Engagement

---

# Technical Challenges

The project should solve several non-trivial engineering problems:

- Synchronizing edits from multiple users simultaneously.
- Maintaining consistency between concurrent clients.
- Supporting thousands of live WebSocket connections.
- Efficiently indexing searchable workspace content.
- Managing permission inheritance across organizations and workspaces.
- Delivering low-latency notifications.
- Tracking complete version history for documents.
- Efficiently storing and retrieving large numbers of files.
- Recovering gracefully from temporary network failures.
- Supporting offline editing with later synchronization.

---

# Scope

The platform should initially target desktop web users while maintaining a modular architecture suitable for future mobile applications.

Every major subsystem should remain independently scalable, including document synchronization, messaging, search, notifications, and file storage.

Long-running operations such as indexing, notification delivery, document export, and media processing should execute asynchronously.

The platform should expose a clean REST API complemented by WebSockets for real-time synchronization.

---

# Expected Outcome

The completed system should resemble a production-grade collaboration platform suitable for modern software teams.

Users should be able to create organizations, invite members, collaborate on documents in real time, manage projects, communicate through integrated messaging, share files, search workspace knowledge, and receive live updates across the platform.

Beyond delivering a polished user experience, the project should demonstrate advanced backend engineering, distributed synchronization, event-driven architecture, real-time systems, scalable search, and secure multi-tenant application design.

This is the github repository : https://github.com/Rajarshi-Kar/CollabSpace
Push this project to github but don't add yourself as a collaborator
Generate a learning_prompt.md where you tell another llm to teach me what this project is in detail and how the tech are being used. 
Generate a linkedin post where you just introduce the project, nothing obnoxious like PLEASED TO ANNOUNCE or those AI Emojis.