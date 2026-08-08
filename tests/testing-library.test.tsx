// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function ForecastToggle() {
  const [enabled, setEnabled] = useState(false);
  return (
    <button type="button" onClick={() => setEnabled((value) => !value)}>
      {enabled ? "Forecast ativo" : "Forecast inativo"}
    </button>
  );
}

describe("Testing Library", () => {
  it("interage com um controle como o usuário", () => {
    render(<ForecastToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Forecast inativo" }));
    expect(screen.getByRole("button", { name: "Forecast ativo" })).toBeInTheDocument();
  });
});
