import "../../src/index.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import SaveQuestionToCanvasModal from "../../src/components/whiteboards/SaveQuestionToCanvasModal";
import DiscoverShareModal from "../../src/components/discover/DiscoverShareModal";
import Modal from "../../src/components/modals/Modal";

function Fixture() {
  const [open, setOpen] = useState<"save" | "share" | null>(null);
  const [nested, setNested] = useState(false);
  // Test controls intentionally stay outside the app's production entry point.
  Object.assign(window, { openModal: setOpen, openNested: setNested });
  return (
    <>
      <div className="app-viewport"><div style={{ height: 500, overflowY: "auto" }} id="background-scroll">
        <div style={{ height: 2000 }}><button onClick={() => setOpen("save")}>Add to page</button></div>
      </div></div>
      {open === "save" && <SaveQuestionToCanvasModal subject="maths" attachment={{ id: "test", source: "custom", label: "Question 1" } as never} onClose={() => setOpen(null)} />}
      <DiscoverShareModal open={open === "share"} onClose={() => setOpen(null)} />
      {nested && <Modal title="Nested modal" onClose={() => setNested(false)} layer={200}><input aria-label="Nested field" /></Modal>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><MemoryRouter><Fixture /></MemoryRouter></StrictMode>);
