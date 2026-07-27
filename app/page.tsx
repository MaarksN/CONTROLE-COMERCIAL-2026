import { getChatGPTUser } from "./chatgpt-auth";
import { loadCommercialData, resolveCanEdit } from "@/db/commercial-data";
import { CommercialControl } from "./CommercialControl";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [chatGPTUser, data] = await Promise.all([getChatGPTUser(), loadCommercialData()]);
  const canEdit = await resolveCanEdit(chatGPTUser?.email ?? null);

  const user = chatGPTUser
    ? { displayName: chatGPTUser.displayName, email: chatGPTUser.email, isPreview: false }
    : { displayName: "Atlas Comercial", email: "public@atlas.local", isPreview: true };

  return <CommercialControl data={data} user={user} isReadOnly={!canEdit} />;
}
