import { cache } from "react";
import { auth } from "@/server/auth";

/**
 * Who is signed in, asked once per page. A page is made of a layout and the page itself (and sometimes more), and each used to ask
 * the database for the session on its own: two queries every time, and in production every query is a trip to the database.
 */
export const getSession = cache(() => auth());
