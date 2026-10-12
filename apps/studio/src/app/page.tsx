import { StudioQueryProvider } from "../components/providers/query-provider";
import { StudioWorkspaceLive } from "../features/studio/studio-workspace-live";

export default function Page() {
  return <StudioQueryProvider><StudioWorkspaceLive /></StudioQueryProvider>;
}
