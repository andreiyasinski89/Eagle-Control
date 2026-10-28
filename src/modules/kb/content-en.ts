import type { ArticleText } from "./articles";

/** The knowledge base in English (Polish shows it too, until it is translated). The same slugs as content-ru.ts. */
export const EN: Record<string, ArticleText> = {
  "quick-start": {
    title: "Quick start: the first 10 minutes",
    summary: "From an empty workspace to your first working day in seven steps.",
    body: `In ten minutes you go from an empty workspace to your first working day. The same steps, ticking themselves, are on the [Start](app:/start) page.

## Step 0. Sign in
Enter your e-mail, tick the agreement and get a mail with a link. Open it and press the "Sign in" button. The link works **once and for 15 minutes**: if it is stale, just ask for a new one. No password needed.

## Step 1. Set your clock
Open [Settings](app:/settings) and choose your time zone. Days, weeks, totals and reminders depend on it; without it evening work can land on the wrong day.

## Step 2. Write your dream
On [Start](app:/start) write where you are going, why, by when, and how many clients and partners it takes. It is your compass: the app shows the distance to it. More: [Dream, goal and distance](kb:dream-goals).

## Step 3. Write down the people
In CRM → [People](app:/crm/people) press "Add a list" and paste names, one per line. Do not filter: sorting comes later. 25 names are enough to start; the goal is 100. More: [The list of 100](kb:list-100).

## Step 4. Give everyone a next step
Everyone should have a clear next step and a date. That is how they appear in My day and in your plan of the day on the right day. More: [Plan of the day](kb:day-plan).

## Step 5. Add scripts and turn on an auto-plan
On the [Scripts](app:/crm/scripts) tab press **"Add ready-made scripts"**: you get 18 ready texts for every stage of the funnel (a new workspace already has them). Rewrite them to your voice and turn on auto-plans for the stages. More: [Scripts and auto-plans](kb:scripts-autoplans).

## Step 6. Work by the plan of the day
Every morning open [My day](app:/) and the [Plan of the day](app:/crm/day), go down "To do today", press "Done" and set the next date. More: [My day](kb:my-day) and [The daily rhythm](kb:daily-rhythm).

> Tip: do not try to set up everything at once. First the list and a next step for everyone; the rest comes as you go.`,
  },

  "app-tour": {
    title: "How the app is laid out",
    summary: "What is where: the menu, My day, projects, CRM, time, notes, account.",
    body: `The menu on the left is grouped by meaning.

## Work
- **My day** — your start page: what is on today (meetings, tasks, people to write to), plan against fact. More: [My day](kb:my-day).
- **Start** — the steps from the first login to a working day, and your dream.
- **My tasks** — all your tasks from all projects, with subtasks.
- **Projects** — a project as a map (MindMap), a board, a list, a calendar, a timeline: one project, several views. About the timeline: [Timeline and smart sort](kb:timeline).
- **Calendar** — meetings and calls, including those scheduled from a person's card.
- **Time** — the timer and totals by day, week and month.
- **Notes and links** — your private notebook.
- **Knowledge base** — these articles, the PDF guide and the presentation.

## Customers
- **CRM** — everything about people: the tabs "Plan of the day", "People", "Team", "Team activity", "Network map", "Pipeline" (the sales funnel), "Companies", "Contacts", "Activities", "Scripts".

## Insights
- **Reports** — summaries of projects and the CRM, including "Why we lose" ([Reasons for a decline](kb:decline-reasons)).

## Bottom left
- **Settings** — time zone, members, integrations.
- **Your name → Account:** your profile (first name, last name, phone, Telegram), your invitation link, the consent to show your activity to your sponsor, account deletion. More: [Invitations and links](kb:invite-links).

## Useful habits
- Search and quick jump: the "Search or jump to…" button at the top, or \`Ctrl+K\`.
- The **bell** at the top shows notifications; press one and you land on the right page.
- Language and theme (light and dark) switch at the top right.
- The "Start" button at the top right starts the timer on any page.

> If you are lost, open [My day](app:/): it gathers the main things for today in one place.`,
  },

  tasks: {
    title: "Tasks and projects",
    summary: "How to create tasks as a list, subtasks, due dates, the board and the timeline.",
    body: `## Creating tasks as a list
In "My tasks" or in the project header press **"Create tasks"**. Each line is one task. A line indented or starting with "-" under an ordinary one is a subtask of the previous one. At the bottom you see what will be made.

1. Choose the project and the list (an epic or a sprint) or make a new one.
2. Choose who gets the tasks (you by default).
3. The "for all" due date is **today** by default; change or clear it.
4. Press "Create" or **"Create and add next"** (\`Ctrl+Enter\`): the window stays open, the project, list, assignee and date are kept, only the text changes.

> Tip: when you write many tasks in a row, use "Create and add next". The project board has the same: a quick-add button in every column.

## Subtasks
A task has a branch of small tasks. In "My tasks" subtasks appear under the task, and finished ones are ticked.

## Projects
One project opens in several views: map (MindMap), board (kanban), list, calendar, timeline. The header of any view has "Create tasks" and "New list". About the timeline and how to lay tasks out in time with one button: [Timeline and smart sort](kb:timeline).

## My tasks
The tabs "Overdue", "Today", "This week", "Later" gather your tasks by due date. New tasks land in the tab their date belongs to.

Related: [My day](kb:my-day), [Timer and time](kb:timer), [Notes and links](kb:notes).`,
  },

  funnel: {
    title: "The funnel and stages",
    summary: "Nine stages, warmth, the Travel/Business priority, the reason for a decline and the person's card.",
    body: `The funnel shows where each person is on the way to becoming a client or a partner. Open CRM → [People](app:/crm/people).

## Stages
The board columns, left to right:
- **New lead** — you wrote the person down but have not reached out yet.
- **First contact** — you wrote or called.
- **Warming up** — you talk, share information, learn what matters.
- **Presentation** — the person has seen the offer.
- **Deciding** — thinking, asking questions.
- **Client** and **Partner** — the result.

A hidden column at the side: **Declined** and **No reply**. Open it with the "Declined and silent" button.

## How to move
Drag the card to another column or choose the stage in the menu on the card. In the "Contacts" table the stage also changes right in the row, with a drop-down. Every move is recorded: the week in the [plan of the day](kb:day-plan) is counted from them. When you move someone to **"Declined"** the app asks for the reason: [Reasons for a decline](kb:decline-reasons).

## A person's card
Press a person and the card opens. At the top are the actions: schedule a contact, call, e-mail, note. Below, in order:
- **Partner:** the sponsor and "Works with" (you can pick "Me (my account)"), the handoff card. More: [Partners](kb:partners).
- **Funnel:** stage, warmth, next step and date, source, country, priority, group, interests. For a decline: the reason.
- **Scripts** for this stage.

## Warmth
Hot, warm, cold: press the icon in the card, the choice shows at once; press again to clear it. With the "Any warmth" filter keep only the ones you need on the board.

## Priority: travel or business
What matters more to the person: **Travel** or **Business**. You choose it in the card (pressing again clears it), in "Add a list" (for everyone at once) and with a filter on the board. It helps decide what to talk about first.

> Rule: everyone on the board should have a next step with a date. More: [Plan of the day](kb:day-plan).

Related: [The list of 100](kb:list-100), [Groups](kb:groups), [Partners](kb:partners).`,
  },

  "list-100": {
    title: "The list of 100",
    summary: "How to write down everyone you know quickly without getting lost in names.",
    body: `The list is the base of all the work. The longer it is, the more possibilities. The idea is simple: write down **everyone you know, with no filtering**. You decide whom to write to later.

## How to add
In CRM → [People](app:/crm/people) press **"Add a list"** and paste names, one per line:
- \`Anna Kowalska\`
- \`Egor Potapov — met at a conference\`
- \`Kate; @kate; +48 600 111 222\`

After a semicolon you can give a Telegram name, a phone or a note; after " — " comes a note. Duplicates do not double: the app skips them and shows you.

At the bottom of the dialog you set what is common to all: stage, warmth, source, interests, country, priority, group, owner. It saves time when you paste a list "from one place".

## Import from a spreadsheet
If the list is already in Excel or CSV, press "Import Excel / CSV". The app recognises your columns (stage, warmth, interests, source, next step, country, sponsor, priority). What could not be read goes into the person's note and is not lost.

## The counter
At the top of the board there is a counter "On the list: N of 100". 25 names are enough to start: that is enough for the "List of 100" step in [Start](app:/start) to count. The goal is 100 and beyond.

## How not to get confused
- Write the full name: it is easier to search.
- In the note field write at once how you know the person.
- Split a long list into [groups](kb:groups): warm market, cold, city. The groups panel on the left can be folded with a button.

> Tip: add to the list every week. It is part of the [weekly rhythm](kb:weekly-rhythm).`,
  },

  "scripts-autoplans": {
    title: "Scripts and auto-plans",
    summary: "Ready texts for every stage of the funnel, and a next step that fills itself in.",
    body: `## Scripts
A script is a ready text for a moment: a first message, an invitation, a second touch. Open CRM → [Scripts](app:/crm/scripts).

### Ready-made scripts
Press **"Add ready-made scripts"**: the section gets a set of 18 texts in the language of the screen: for every stage of the funnel (a first message to an acquaintance and "by recommendation", find out what matters, invite to a presentation, ask for impressions, help with the decision, the "too expensive" and "no time" objections, thanks to a client, welcome to a partner, a polite end, coming back later, a gentle reminder) and for any moment. Pressing again adds nothing twice, and brings back one you deleted. A newly made workspace already has the set.

It is a starting point, not a rule: open any script with the pencil and rewrite it in your voice. Square brackets mark what to fill in by hand (a day, a time, a link).

### Your own scripts
Press "New script". In the text you can write:
- \`{name}\` — the person's first name,
- \`{full_name}\` — first and last name,
- \`{my_name}\` — your name.

A script is tied to a funnel stage or to "any moment". In a person's card the "Scripts" block shows those that fit their stage, with a **"Copy"** button: the text is copied with the name already filled in, and you only paste it into a messenger. In the [plan of the day](kb:day-plan) each row has the same buttons.

## Auto-plans
An auto-plan answers "what next?" for you. For each stage you set once the text of the next step and in how many days. When a person moves into that stage, the next step and date fill in automatically, and the person appears in [My day](kb:my-day) and in the plan of the day on the right day.

Press "Fill with an example" to get ready wordings and adjust them. Leave the text empty for a stage where no next step is needed.

> If you gave the next step yourself when moving, the auto-plan does not overwrite it.

Related: [The funnel](kb:funnel), [Plan of the day](kb:day-plan).`,
  },

  "day-plan": {
    title: "Plan of the day and the week's goals",
    summary: "What to do today, how to close steps and how the week is counted.",
    body: `Open CRM → [Plan of the day](app:/crm/day). It is your working page. The same people also appear in [My day](kb:my-day): the "Contacts for today" block.

## The week against goals
At the top are six numbers for the week (Monday to Sunday by your time):
- added to the list,
- people reached,
- presentations,
- clients,
- partners,
- calls and meetings.

They **count themselves** from what you did: every move into a stage is an event. Press "Set goals for the week" and each number gets a goal and a progress bar. The arrows show earlier weeks.

## To do today
Below is the list of people whose next step is due today or late. Each row has:
- **Done** — close the step;
- **Next in 1 / 3 / 7 d** — close the step and set the next date at once;
- the **script** buttons for the person's stage.

A closed step is written into the person's feed, and they count as "touched today".

> If a step is not needed, press "Done" without a new date: the person leaves the list. If they are still of interest, set a date.

## The team this week
If you have [partners](kb:partners) with people, the bottom shows how many of their people this week were reached, got to a presentation, became clients and partners. How your partners do day by day: [Team activity](kb:team-activity).

Related: [The daily rhythm](kb:daily-rhythm), [The weekly rhythm](kb:weekly-rhythm).`,
  },

  groups: {
    title: "Groups and subgroups",
    summary: "How to split a long list into parts and work with them separately.",
    body: `When the list grows it helps to split it into parts: cold market, warm market, a city, an event. In CRM → [People](app:/crm/people) the **"Groups"** panel on the left is for that.

## How it works
- Groups nest up to **three levels**: "Cold market" → "Gym" → "Morning class".
- Press a group: the board keeps its people **with its subgroups**.
- "Everyone" and "No group" are always on top; each group has its own counter.
- A person is in one group: that way the list is not doubled and the person can be handed over cleanly.

## What you can do
- The "+" button makes a group, the folder icon on a group makes a subgroup.
- The pencil: rename, recolour, move into another group, or delete.
- **Deleting a group deletes nobody:** its people and subgroups move up one level.
- Tick people on the cards and choose "Move to group". You can also pick the group in a person's card and in "Add a list".

> Tip: start with two or three groups. Too fine a split gets in the way more than it helps.

Related: [The list of 100](kb:list-100), [The network map](kb:network-map).`,
  },

  partners: {
    title: "Partners, sponsor and handing over contacts",
    summary: "How the team is built, how to hand people to partners and what the handoff card is.",
    body: `A partner is a person at the **Partner** stage. The whole team is built of such people and the links between them.

## Sponsor
In a person's card, the **"Partner"** block (it is at the top of the card), choose the **sponsor**: who brought or leads this person. Only a partner can be a sponsor. The app will not let you put a person above themselves (loops in the tree are forbidden).

## "Me (my account)"
As a sponsor, or as the one who "works with" a person, you can choose **yourself**: the **"Me (my account)"** option. It is a link to your account, not a person's card: you do not need to make or see a card for yourself, and you are not in the lists. On the [network map](kb:network-map) such people hang straight from you, in the middle of the map.

## The "Team" tab
CRM → [Team](app:/crm/team) shows the tree of partners: for each you see how many people they work with, how many are in their line and how many partners in it. The "In MeetOwl" tag marks those with their own account. Your **referral link** for people is here too ([Invitations and links](kb:invite-links)).

## Handing over contacts
Tick people on the board and choose **"Hand to partner"** (up to 500 at a time), or choose the partner in the "Works with" field of the card. There are two ways to work with a partner:
- **A partner with a MeetOwl account.** Link their account in the partner's card ("MeetOwl account"). The people handed over become theirs and appear in their lists.
- **A partner without an account.** The people stay with you, and in their card the **"Handoff card"** button builds a ready text (contacts, stage, warmth, interests, next step, latest notes). Copy it into a messenger.

Every handover is saved: who, to whom, when and with what note. You see it in the person's card. "Nobody" in "Works with" returns the person to you.

> Deleting a partner does not delete the people or the history: only the link goes away.

Related: [Team activity](kb:team-activity), [Network map](kb:network-map), [Plan of the day](kb:day-plan).`,
  },

  "network-map": {
    title: "The network map",
    summary: "The whole network on one MindMap: by sponsors, by groups or by who works with whom, with filters.",
    body: `CRM → [Network map](app:/crm/network) shows everyone on one map, and **you are in the middle**: the root of the map is you, there is no card with your name.

## Three ways to arrange it
- **By sponsors:** partners under their sponsors, each person under whoever brought them. Those whose sponsor is "Me (my account)" hang straight from you. People with no sponsor are gathered in a "No sponsor" node.
- **By groups:** the tree of groups, and in each group its people.
- **By who works with whom:** partners side by side, each with the people you handed to them.

## Filters
- **Hide people without a sponsor** leaves the working structure: it removes those with no sponsor and nobody below them. A person with no sponsor who has people below stays (they are the head of a structure).
- **Sides:** the structure on the left, no sponsor on the right. People with sponsors are laid out to the left of you (mirrored), and "No sponsor" goes to the right.
- **Stage** and **Warmth** narrow down the other people (partners always stay).
- **Levels** (1-5) show only the first levels of the structure: the cards at the edge say how many people are below.
- **Reset filters** brings everything back.

## How to read it
- **The card colour is the funnel stage** (the legend is above the map).
- A card shows stage, warmth and country; the root, groups and partners say how many people are below.
- Press a person or partner: their card opens beside, and you can change anything there.
- The switches "Show people" and "Hide declined and silent" help when there are many people. With "Show people" off only the structure remains.

> The map is read-only. Change the sponsor, group and handover in the person's card.

Related: [Partners](kb:partners), [Groups](kb:groups), [Team activity](kb:team-activity).`,
  },

  "dream-goals": {
    title: "Dream, goal and the distance to it",
    summary: "How to write down a dream and measure the way to it by clients and partners.",
    body: `Working with people goes easier when it is clear what it is for. Open [Start](app:/start) and fill in **"My dream and goal"**.

## What to write
- **My dream** — where you are going: a house by the sea, freedom, travel.
- **Why it matters** — in two or three sentences. Read it on a hard day.
- **By when.**
- **How many clients and partners** it takes to make the dream real.

## The distance to the dream
The app counts how much you have already won: your own people in the "Client" and "Partner" stages, where you are the owner. And it shows:
- the share of the way;
- how many clients and partners are left;
- how many days are left (or how long past the date);
- the pace needed: how many clients and partners a week.

> A goal is not a verdict. If the date has passed, move it. What matters is seeing that you are moving.

## How to use it
Once a week look at the distance at the [weekly review](kb:weekly-rhythm). If the pace needed is higher than yours, add more people to the list and more reaching out.`,
  },

  timer: {
    title: "The timer and time",
    summary: "How to start the timer, how time is counted and how to read the totals.",
    body: `The timer shows where your time goes. It **runs until you stop it**: it never stops by itself.

## Starting
Press **"Start"** at the top right on any page. Write what you are working on ("Calls to the list"), or pick one of your tasks. While it runs, the top shows what it is on, the clock and a Stop button.

- Time can be **without a task**: calls, messages, study. It goes into your totals marked "no task".
- Starting a new timer stops the previous one and keeps its time.
- A timer shorter than 30 seconds records nothing.
- If it runs for over 8 hours a ⚠ mark appears: you may have forgotten to stop it.

## Totals
Open [Time](app:/time). At the top, four totals: **today, week, month, all time**; pressing one opens the period. The tabs **Day / Week / Month / All time** have arrows to go back. Each shows the total, bars by day (by month for all time), "Where the time went" and the entries, which can be deleted.

## Days by your own clock
Time is counted in the day of your time zone ([Settings](app:/settings)). A timer left on over midnight is cut into both days, and a day never holds more than 24 hours.

Related: [Tasks and projects](kb:tasks), [The daily rhythm](kb:daily-rhythm).`,
  },

  notes: {
    title: "Notes and links",
    summary: "A private notebook: notes that save themselves, and useful links.",
    body: `[Notes and links](app:/notes) is your own notebook. **Only you can see it**: no other member, not even the owner of the workspace.

## Notes
Press "New note" and write a title and text. Everything **saves itself**, like on paper: the bottom shows "Saving / Saved". A note can be pinned to the top.

Web addresses written in the text show as clickable chips under the note.

## Links
"New link" is a note with a web address. The "Open" button opens the site in a new tab, and in the field below you can write why the link is useful and who to send it to.

## Search and filters
Search goes through titles, texts and addresses. Filters: All, Notes, Links, Pinned.

> What to put there: the day's results, ideas, material for newcomers, links to videos and presentations. Texts for the whole team belong in [scripts](kb:scripts-autoplans).`,
  },

  "daily-rhythm": {
    title: "The daily rhythm",
    summary: "What to do in the morning, in the day and in the evening so work with people flows without overload.",
    body: `A result comes not from a heroic day but from a repeating rhythm. Here is a simple scheme for every working day.

## Morning (10 minutes)
1. Open [My day](app:/): what is on today, which calls and meetings, how many people wait for a next step ([My day](kb:my-day)).
2. Open the [Plan of the day](app:/crm/day) and look at "To do today": first the late and warm ones.
3. Start the timer: "Start" → "Calls from the list".

## Day: work through the list
- Go down the list. Copy the script for the stage, write or call.
- After each person press **"Done"** and set the next date ("Next in 1 / 3 / 7 d").
- Add new acquaintances at once with "Add a list" ([The list of 100](kb:list-100)).
- Move those who replied along the funnel ([The funnel](kb:funnel)). If someone says no, record the reason ([Reasons for a decline](kb:decline-reasons)).

> The rule of the day: **three closed steps at the very least**. It is the start of a rhythm, and it is the "First day by plan" step in [Start](app:/start).

## Evening (5 minutes)
1. Stop the timer.
2. Check that everyone you spoke to has a next step with a date.
3. Look at "Plan and fact" in My day: how much is done.
4. Write the day's result and tomorrow's main step in a [note](kb:notes).

Related: [Plan of the day](kb:day-plan), [The weekly rhythm](kb:weekly-rhythm).`,
  },

  "weekly-rhythm": {
    title: "The weekly rhythm",
    summary: "A 30-minute weekly review: the counters, the list, the team and the dream.",
    body: `Once a week (Sunday evening or Monday morning works well) give 30 minutes to a review. It turns days into movement.

## 1. The week's results
Open the [Plan of the day](app:/crm/day): compare fact with the week's goals. What went best, and what slipped: people reached, presentations, clients?

## 2. People
- Go through "No reply" and "Declined": decide whom to write to once more and whom to leave. See which reasons for a decline repeat ([Reasons for a decline](kb:decline-reasons)).
- Check those who have had no next step for a long time.
- Top up the [list](kb:list-100): add new names until it reaches 100.

## 3. The team
If you have [partners](kb:partners): open [Team activity](kb:team-activity) and see who has gone quiet. The "Team this week" at the bottom of the plan of the day shows the results. Decide whom to call and whom to hand new people to.

## 4. The dream
Open [Start](app:/start) and look at the [distance to the dream](kb:dream-goals). Is the current pace enough? If not, raise the number of people and of reaches.

## 5. Next week's goals
Set them in the plan of the day: honest, but a little above the current ones.

> Do not drop the review even when the week was weak: that is when it is needed most.

Related: [The daily rhythm](kb:daily-rhythm), [Plan of the day](kb:day-plan).`,
  },

  "my-day": {
    title: "My day",
    summary: "The start page: the numbers of the day, contacts for today, plan against fact.",
    body: `[My day](app:/) gathers everything for today in one place. Begin the morning here.

## Three numbers at the top
- **Tasks to do** — project tasks (late and for today), CRM items and the people whose next step is due today.
- **Meetings** — calendar events and scheduled calls and meetings.
- **Need attention** — stuck deals and people you have not talked to for a long time.

Press a number: the page scrolls to the lists, shows only that, and a line "Showing only: …" appears under the numbers. The **"Show everything"** button brings all the blocks back.

## Contacts for today
The "Contacts for today" block shows the people of your [plan of the day](kb:day-plan): those whose next step is due today or already late. The header has a number; the red number beside it is the late ones. Press the block and the list opens: a name leads to the person's card, beside it you see the stage, the next step and the date. The tick closes the step, like "Done" in the plan of the day.

## Tasks and things for today
Late tasks, tasks for today and CRM items come as separate blocks. Each task shows its project and due date; press it to open.

## Plan and fact
At the bottom, "Plan and fact for today":
- **Tasks** — planned and done among the project tasks;
- **Meetings and calls** — calendar events;
- **Contacts and CRM today** — everything you planned with people: calls, meetings, e-mails, messages, tasks and contacts with a next step today. Press it to open the list and tick items right there.

Below are two rings: the **efficiency of the day** (how much of what was planned is done) and **productivity** (counting what you cleared from the past). Under them is the time the timer recorded today.

> Rule: if a lot is planned for today, start with the red (late) and warm people.

Related: [Plan of the day](kb:day-plan), [The daily rhythm](kb:daily-rhythm).`,
  },

  timeline: {
    title: "Timeline and smart sort",
    summary: "Tasks on a time axis from today: zoom, hiding finished ones, story points and one-button scheduling.",
    body: `The timeline shows a project's tasks as bars from start to due date. Open a project and choose the **"Timeline"** view.

## The axis starts today
Past days are not shown: the first column is always today. For tasks that means:
- a task that began earlier is cut at the left edge and runs to its due date;
- a task that is **late and not finished** stays at the very start as a red bar labelled "overdue since …": it cannot be lost;
- finished tasks from the past are hidden by themselves.

## Zoom
- **"Whole period"** stretches everything to the width of the screen: nothing to scroll.
- **"Days", "Weeks", "Months"** are ready scales; the **"−" and "+"** buttons zoom smoothly.
- The name of a short bar is written beside it so everything reads.
- Weekends are slightly shaded, and today is marked by a line labelled "Today".

## Hide finished
The **"Hide finished"** button (with the number of finished tasks) leaves on the chart only what is still ahead. The choice is remembered on this device.

## Move and link
Drag a bar to move both dates. A red arrow means the task that blocks another ends later than the blocked one should start.

## Smart sort
The **"Smart sort"** button lays tasks out one after another by their size:
- **size is in story points**: 1 story point = 10 minutes of work. You set it in the task's card; it is **optional**, without it a task counts as small;
- **every assignee has their own queue**: tasks do not overlap;
- scheduling **starts today**; you can change the start date and the length of the working day in the window.

After scheduling a line appears with an **"Undo"** button that brings the old dates back.

> Tip: when dates have drifted, put story points on the main tasks and press Smart sort: you get an honest schedule.

Related: [Tasks and projects](kb:tasks), [My day](kb:my-day).`,
  },

  "decline-reasons": {
    title: "Reasons for a decline and the report",
    summary: "How to record why a person said no, and what the \"Why we lose\" report shows.",
    body: `A no is information too. If you record the reasons, you will see what repeats and can adjust the conversation.

## How to record a reason
When you move a person to **"Declined"** (by dragging, in the "Contacts" table or on the board), a window "Why did they say no?" appears with the choices. Press one, or "Skip": the reason then stays "Not specified". In the card of a person at the Declined stage you can choose or change the reason at any time.

## Seven reasons
- Not interested, not for them
- No money or too expensive
- No time
- Distrusts network marketing ("a pyramid")
- Doubts the product or the company
- Family or close ones are against
- Other

If the person is moved back to another stage, the reason is cleared and they leave the statistics.

## Where to look
Open **Reports → CRM**: the **"Why we lose"** card shows the reasons given by people who declined over the chosen period, together with the reasons deals were lost, the most frequent first. The labels read in full. The CSV button exports the same data.

> How to use it: if "Distrusts network marketing" comes up most, prepare a calm answer in the [scripts](kb:scripts-autoplans) and discuss it at the [weekly review](kb:weekly-rhythm).

Related: [The funnel](kb:funnel).`,
  },

  "team-activity": {
    title: "Team activity",
    summary: "How the people directly below you are doing: what they did, when they last did it and who has gone quiet.",
    body: `CRM → [Team activity](app:/crm/team-activity) shows how the people **directly below you** (the first line) are doing.

## What is on the page
The period switches between **7 and 30 days**. For each person:
- **the state**: Active (an action in the last 3 days), Gone quiet (3-6 days), Long gone (7 days or more), No sign yet;
- **the last action**: today, yesterday or how many days ago;
- the numbers for the period: added, reached, presentations, clients, partners, calls and meetings, tasks.

At the top is a counter "N have gone quiet": you see at once whom to write to.

## Two groups
- **Partners of the first line in your CRM.** The partners with no other partner above them. It is counted from the people they work with ("Works with"). The name opens the card.
- **People who came through your invitation link.** They have their own workspaces, so the consent rule (below) applies.

## Consent: numbers only, and only if they wish
People of the second group **decide themselves** whether to show you their activity. Until a person agrees, the row says "Summary not shared" and there are no numbers at all. Consent is a tick in their "Account" (and is offered when they sign up through your link), and can be taken back at any time. Even with consent you see **only the numbers and the date of the last action**: never the names of their clients, messages or notes.

> How to use it: once a week at the [review](kb:weekly-rhythm) see who has gone quiet and write to them simply and kindly: "How are you? How can I help?".

Related: [Partners](kb:partners), [Invitations and links](kb:invite-links).`,
  },

  "invite-links": {
    title: "Invitations and links",
    summary: "Two invitation links, signing in by e-mail and bonus points.",
    body: `You can invite people with two links: they serve different purposes.

## The link for prospective clients and partners
It is on the CRM → [Team](app:/crm/team) tab (the card with the invitation link). A person opens it, gives a name and e-mail, and a card appears in your CRM: stage "New lead", source "Referral link", under you in the tree, and you get a notification. Use it in mailings and messages when you want the person to leave their contacts themselves.

## The link for those who will work in MeetOwl themselves
It is in **Account** (your name at the bottom left → Account, the invitation card). A person who comes through it gets **their own workspace** with their own client base, CRM, reports and projects. No card is created in your CRM: they are a separate user.
- For each person who comes you get a **bonus point** and a notification.
- You see how they progress: whether the first steps are done (made a workspace, added people).
- You see the numbers of their activity only if they agreed: [Team activity](kb:team-activity).

## How to sign in by e-mail
No password. Enter your e-mail, tick the agreement to the terms and press "Send link". From the mail open the link and press the "Sign in" button. Note:
- the link works **once and for 15 minutes**;
- if you open it a second time or later, you see the sign-in page with an explanation: ask for a new link;
- the mail may land in "Spam" the first time.

## Bonus points
Points are given for invited people. Later they can be exchanged for months of the paid plan (three points, one month): [Plans and the open beta](kb:plans).

> Tip: tell the person you invited what to do first: [Quick start](kb:quick-start).

Related: [Partners](kb:partners), [Team activity](kb:team-activity).`,
  },

  plans: {
    title: "Plans and the open beta",
    summary: "What is free now, how the paid plan will work and what stays with you.",
    body: `## Now: the open beta
The platform is in an open beta: **all features are free**, with no limits on people and teams. In "Settings", in the billing and plan section, it says "Open beta".

## What is planned
Later a paid **Pro** plan will appear for those who build a team and use extended features: access and teams, the network map and team activity, smart sort, reports, integrations, the client portal, the API, AI and contact export. The free plan keeps the main things: the funnel, the plan of the day, scripts, notes, the timer, Start and the knowledge base.

Also planned:
- **14 days of Pro without a card** for your first workspace;
- **bonus points** for invited people, exchangeable for months of Pro.

## Your data stays in any case
If the plan changes nothing is deleted: the data stays with you, and some features may need Pro.

Related: [Invitations and links](kb:invite-links).`,
  },
};
