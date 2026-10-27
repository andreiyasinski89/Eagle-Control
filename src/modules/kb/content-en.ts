import type { ArticleText } from "./articles";

/** The knowledge base in English (Polish shows it too, until it is translated). The same slugs as content-ru.ts. */
export const EN: Record<string, ArticleText> = {
  "quick-start": {
    title: "Quick start: the first 10 minutes",
    summary: "From an empty workspace to your first working day in six steps.",
    body: `In ten minutes you go from an empty workspace to your first working day. The same steps, ticking themselves, are on the [Start](app:/start) page.

## Step 1. Set your clock
Open [Settings](app:/settings) and choose your time zone. Days, weeks, totals and reminders depend on it; without it evening work can land on the wrong day.

## Step 2. Write your dream
On [Start](app:/start) write where you are going, why, by when, and how many clients and partners it takes. It is your compass: the app shows the distance to it. More: [Dream, goal and distance](kb:dream-goals).

## Step 3. Write down the people
In CRM → [People](app:/crm/people) press "Add a list" and paste names, one per line. Do not filter: sorting comes later. 25 names are enough to start; the goal is 100. More: [The list of 100](kb:list-100).

## Step 4. Give everyone a next step
Everyone should have a clear next step and a date. That is how they appear in your plan of the day on the right day. More: [Plan of the day](kb:day-plan).

## Step 5. Write a script and turn on an auto-plan
On the [Scripts](app:/crm/scripts) tab save the text you send most often and turn on auto-plans for the funnel stages. More: [Scripts and auto-plans](kb:scripts-autoplans).

## Step 6. Work by the plan of the day
Every morning open the [Plan of the day](app:/crm/day), go down "To do today", press "Done" and set the next date. More: [The daily rhythm](kb:daily-rhythm).

> Tip: do not try to set up everything at once. First the list and a next step for everyone; the rest comes as you go.`,
  },

  "app-tour": {
    title: "How the app is laid out",
    summary: "What is where: the menu, My day, projects, CRM, time, notes.",
    body: `The menu on the left is grouped by meaning.

## Work
- **My day** — your start page: what is on today (meetings, tasks, things to do with people), plan against fact and the getting-started reminder.
- **Start** — the steps from the first login to a working day, and your dream.
- **My tasks** — all your tasks from all projects, with subtasks.
- **Projects** — a project as a map (MindMap), a board, a list, a calendar, a timeline: one project, several views.
- **Calendar** — meetings and calls, including those scheduled from a person's card.
- **Time** — the timer and totals by day, week and month.
- **Notes and links** — your private notebook.
- **Knowledge base** — these articles.

## Customers
- **CRM** — everything about people: the tabs "Plan of the day", "People", "Team", "Network map", "Pipeline" (the sales funnel), "Companies", "Contacts", "Activities", "Scripts".

## Insights
- **Reports** — summaries of projects and the CRM.

## Useful habits
- Search and quick jump: the "Search or jump to…" button at the top, or \`Ctrl+K\`.
- Language and theme switch at the top right.
- The "Start" button at the top right starts the timer on any page.
- Your time zone is set in [Settings](app:/settings): days and weeks follow it.

> If you are lost, open [My day](app:/): it gathers the main things for today in one place.`,
  },

  tasks: {
    title: "Tasks and projects",
    summary: "How to create tasks as a list, subtasks, dates and the board.",
    body: `## Creating tasks as a list
In "My tasks" or in a project's header press **"Create tasks"**. Each line is one task. An indented line, or one starting with a dash under a plain one, is a subtask of the task above. The preview shows what will be made.

1. Pick the project and the list (an epic or sprint), or make a new one.
2. Choose who gets the tasks (you, by default).
3. The "due date for all" starts as **today**; change it or clear it.
4. Press "Create", or **"Create and add next"** (\`Ctrl+Enter\`): the window stays open, the project, list, assignee and date are kept, only the text starts afresh.

> Tip: when you write many tasks in a row, use "Create and add next".

## Subtasks
A task has a branch of small tasks. In "My tasks" they show under the task, and finished ones are ticked.

## Projects
One project opens in several views: map (MindMap), board (kanban), list, calendar, timeline. The header of every view has "Create tasks" and "New list".

## My tasks
The tabs "Overdue", "Today", "This week", "Later" gather your tasks by date. New tasks land in the tab their date belongs to.

Related: [The timer and time](kb:timer), [Notes and links](kb:notes).`,
  },

  funnel: {
    title: "The funnel and its stages",
    summary: "Nine stages, warmth, the travel-or-business priority and the person's card.",
    body: `The funnel shows where each person is on the way to becoming a client or a partner. Open CRM → [People](app:/crm/people).

## Stages
The columns of the board, left to right:
- **New lead** — you wrote the person down but have not reached out yet.
- **First contact** — you wrote or called.
- **Warming up** — you talk, give information, find out what matters.
- **Presentation** — the person has seen the offer.
- **Deciding** — thinking it over, asking questions.
- **Client** and **Partner** — the result.

The folded column at the side holds **Declined** and **No reply**. Open it with "Declined and silent".

## Moving people
Drag a card to another column, or pick a stage in the menu on the card. Every move is recorded: the week in the [plan of the day](kb:day-plan) is counted from them.

## Warmth
Hot, warm, cold. Set it with a mark on the card, and use the "Any warmth" filter to keep only the ones you want on the board.

## Priority: travel or business
What matters more to the person: **Travel** or **Business**. You choose it in the card, in "Add a list" (for everyone at once) and as a filter on the board. It helps you decide what to talk about first.

## The person's card
Press a card. In the "Funnel" block: stage, warmth, **next step and date**, source, country, influence (0–100), priority, group, interests. Below: the scripts for this stage and the "Partner" block.

> The rule: everyone on the board has a next step with a date. More: [Plan of the day](kb:day-plan).

Related: [The list of 100](kb:list-100), [Groups](kb:groups), [Partners](kb:partners).`,
  },

  "list-100": {
    title: "The list of 100",
    summary: "How to write down everyone you know quickly, without sorting.",
    body: `The list is the base of all the work. The longer it is, the more chances you have. The idea is simple: write down **everyone you know, without filtering**. Deciding whom to write to comes later.

## How to add
In CRM → [People](app:/crm/people) press **"Add a list"** and paste names, one per line:
- \`Anna Kowalska\`
- \`Egor Potapov — met at the conference\`
- \`Katya; @kate; +48 600 111 222\`

After a semicolon you can give a Telegram name, a phone or a note; after " — " comes a note. A name already in the funnel is not doubled: the app skips it and tells you.

At the bottom of the dialog you set what everyone has in common: stage, warmth, source, interests, country, priority, group, owner. It saves time when the names come "from one place".

## Import from a sheet
If the list is already in Excel or CSV, press "Import Excel / CSV". The app recognises your columns (stage, warmth, interests, source, next step, country, sponsor, priority). What it cannot read goes into the person's note, not lost.

## The counter
The top of the board shows "On the list: N of 100". 25 names are enough to start: they count for the "List of 100" step on [Start](app:/start). The goal is 100 and beyond.

## Keeping it tidy
- Write the full name: it is easier to find.
- In the note field write at once how you know the person.
- Split a long list into [groups](kb:groups): warm market, cold, a city.

> Tip: top the list up every week. It is part of the [weekly rhythm](kb:weekly-rhythm).`,
  },

  "scripts-autoplans": {
    title: "Scripts and auto-plans",
    summary: "Ready texts for each moment, and a next step that fills itself in.",
    body: `## Scripts
A script is a ready text for a moment: the first message, an invitation, a follow-up. Open CRM → [Scripts](app:/crm/scripts) and press "New script".

In the text you can write:
- \`{name}\` — the person's first name,
- \`{full_name}\` — the whole name,
- \`{my_name}\` — yours.

A script belongs to a funnel stage, or to "any moment". In a person's card the "Scripts" block shows those that fit their stage with a **"Copy"** button: the text is copied with the name already filled in, so you only paste it into the messenger.

The [plan of the day](kb:day-plan) has the same buttons on every row.

## Auto-plans
An auto-plan answers "what next?" by itself. For each stage you set once the text of the next step and in how many days. When a person moves into that stage, the next step and its date fill in automatically, and the person shows up in the plan of the day on the right day.

Press "Fill with a suggestion" to get ready wording, and adjust it. Leave the text empty for a stage that needs no next step.

> If you gave the next step yourself while moving the person, the auto-plan does not overwrite it.

Related: [The funnel](kb:funnel), [Plan of the day](kb:day-plan).`,
  },

  "day-plan": {
    title: "Plan of the day and the week's targets",
    summary: "What to do today, how to close steps and how the week is counted.",
    body: `Open CRM → [Plan of the day](app:/crm/day). It is your working page.

## The week against its targets
At the top, six numbers for the week (Monday to Sunday by your clock):
- added to the list,
- reached,
- presentations,
- clients,
- partners,
- calls and meetings.

They are **counted by themselves** from what you did: every move into a stage is an event. Press "Set the week's targets" and each number gets a goal and a progress bar. The arrows show earlier weeks.

## To do today
Below, the people whose next step is due today or late. Each row has:
- **Done** — close the step;
- **Next in 1 / 3 / 7 d** — close the step and set the next date at once;
- the **scripts** for the person's stage.

A closed step is written to the person's feed, and they count as touched today.

> If a step is not needed, press "Done" without a new date: the person leaves the list. If they are still interesting, set a date.

## The team this week
If you have [partners](kb:partners) with people, the bottom shows how many of their people reached out, got to a presentation, became clients and partners this week.

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
    title: "Partners, sponsors and handing over contacts",
    summary: "How the team is built, how to hand people to partners and what a handoff card is.",
    body: `A partner is a person in the **Partner** stage. The whole team is built from such people and the links between them.

## The sponsor
In a person's card, the **"Partner"** block, choose the **sponsor**: who brought or leads this person. Only a partner can be a sponsor. The app will not put a person above themselves (loops in the tree are refused).

## The "Team" tab
CRM → [Team](app:/crm/team) shows the tree of partners: for each, how many people they work with, how many are in their line and how many of those are partners. The "In MeetOwl" mark shows those who have their own account.

## Handing over contacts
Tick people on the board and choose **"Hand over to partner"** (up to 500 at a time), or pick the partner in the "Works with" field of the card. There are two ways to work with a partner:
- **A partner with a MeetOwl account.** Link their account in the partner's card ("Account in MeetOwl"). The people handed to them become theirs and show in their lists.
- **A partner without an account.** The people stay with you, and in their card the **"Handoff card"** button makes a ready text (contacts, stage, warmth, interests, next step, last notes). Copy it into a messenger.

Every hand-over is kept: who, to whom, when and with what note. You see it in the person's card. "Nobody" in the "Works with" field gives the person back to you.

> Deleting a partner deletes neither the people nor the history: only the link goes.

Related: [The network map](kb:network-map), [Plan of the day](kb:day-plan).`,
  },

  "network-map": {
    title: "The network map",
    summary: "The whole network on one MindMap: by sponsors, by groups or by who works with whom.",
    body: `CRM → [Network map](app:/crm/network) shows everyone on one map, with you in the middle.

## Three ways to arrange it
- **By sponsors:** partners under their sponsors, each person under whoever brought them. People with no sponsor are gathered under "No sponsor".
- **By groups:** the tree of groups, with each group's people.
- **By who works with whom:** partners side by side, each with the people you handed to them.

## How to read it
- **The colour of a card is the funnel stage** (the legend is above the map).
- A card shows the stage, the warmth and the country; roots, groups and partners say how many people are below them.
- Press a person or a partner: their card opens beside the map, and you can change anything there.
- The toggles "Show people" and "Hide declined and silent" help when there are many people. With "Show people" off only the structure stays.

> The map is read-only. Change a sponsor, a group or a hand-over in the person's card.

Related: [Partners](kb:partners), [Groups](kb:groups).`,
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
    summary: "What to do in the morning, during the day and in the evening, so the work with people goes without overload.",
    body: `Results come not from a heroic day but from a repeating rhythm. Here is a simple scheme for every working day.

## Morning (10 minutes)
1. Open the [Plan of the day](app:/crm/day).
2. Look at "To do today": the late and the warm first.
3. Start the timer: "Start" → "Calls to the list".

## The day: work down the list
- Go down the list. Copy the script for the stage, write or call.
- After each person press **"Done"** and set the next date ("Next in 1 / 3 / 7 d").
- Add new acquaintances at once with "Add a list" ([The list of 100](kb:list-100)).
- Move those who respond along the funnel ([The funnel](kb:funnel)).

> The rule of the day: **three closed steps at least**. It is the start of the rhythm, and it is the "Your first day by the plan" step on [Start](app:/start).

## Evening (5 minutes)
1. Stop the timer.
2. Check that everyone you spoke to has a next step with a date.
3. Look at the week's counters in the plan of the day: how much is done.
4. Write the day's result and tomorrow's main step in a [note](kb:notes).

Related: [Plan of the day](kb:day-plan), [The weekly rhythm](kb:weekly-rhythm).`,
  },

  "weekly-rhythm": {
    title: "The weekly rhythm",
    summary: "A 30-minute weekly review: counters, the list, the team and the dream.",
    body: `Once a week (Sunday evening or Monday morning works well) give 30 minutes to a review. It turns days into movement.

## 1. The week's results
Open the [Plan of the day](app:/crm/day): compare the fact with the week's targets. What went best, and what slipped: reaching out, presentations, clients?

## 2. People
- Look through "No reply" and "Declined": decide whom to write to once more and whom to leave.
- Check those who have had no next step for a long time.
- Top up the [list](kb:list-100): add new names until it reaches 100.

## 3. The team
If you have [partners](kb:partners): open "The team this week" at the bottom of the plan of the day, choose whom to call and to whom to hand new people.

## 4. The dream
Open [Start](app:/start) and look at the [distance to the dream](kb:dream-goals). Is the current pace enough? If not, add more people and more reaching out.

## 5. Next week's targets
Set them in the plan of the day: honest, but a little above the current ones.

> Do not skip the review even when the week was weak: that is when it is needed most.

Related: [The daily rhythm](kb:daily-rhythm), [Plan of the day](kb:day-plan).`,
  },
};
