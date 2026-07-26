import { loadCommercialData } from "@/db/commercial-data";
import { CommercialControl } from "./CommercialControl";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await loadCommercialData();

  return (
    <CommercialControl
      data={data}
      user={{
        displayName: "Atlas Comercial",
        email: "public@atlas.local",
        isPreview: true,
      }}
    />
  );
}
