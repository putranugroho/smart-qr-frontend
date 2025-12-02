import dynamic from "next/dynamic";
const QrForm = dynamic(() => import("../components/qrForm"), { ssr: false });

export default function Page() {
  return <QrForm />;
}
