import { MarcoOperacion } from "@/components/operacion/MarcoOperacion";

export default function OperacionLayout({ children }: { children: React.ReactNode }) {
  return <MarcoOperacion>{children}</MarcoOperacion>;
}
