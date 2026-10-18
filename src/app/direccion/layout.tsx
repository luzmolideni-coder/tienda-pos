import { SoloAdmin } from "@/components/direccion/SoloAdmin";
import { MarcoOperacion } from "@/components/operacion/MarcoOperacion";

export default function DireccionLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarcoOperacion>
      <SoloAdmin>{children}</SoloAdmin>
    </MarcoOperacion>
  );
}
