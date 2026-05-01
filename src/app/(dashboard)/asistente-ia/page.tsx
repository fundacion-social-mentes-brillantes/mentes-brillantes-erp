import { AsistenteIAClient } from "./AsistenteIAClient"
import { requireRoles } from "@/lib/utils/authz"

export const dynamic = "force-dynamic"

export default async function AsistenteIAPage() {
  await requireRoles(["admin", "caja"])

  return <AsistenteIAClient />
}
