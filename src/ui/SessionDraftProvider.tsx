import type { ReactNode } from "react";
import { SessionDraftContext } from "./session-draft-context";
export function SessionDraftProvider({
  owner,
  children,
}: {
  owner: string | null;
  children: ReactNode;
}) {
  return <SessionDraftContext value={owner}>{children}</SessionDraftContext>;
}
