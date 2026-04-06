import { PlaybookClient } from "@/components/PlaybookClient";

export default function PlaybookPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white">Playbook</h2>
        <p className="text-gray-400 text-sm">Busca semântica no conhecimento indexado</p>
      </div>
      <PlaybookClient />
    </div>
  );
}
