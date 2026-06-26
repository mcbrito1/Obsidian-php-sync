import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Login } from "./Login";
import { getToken } from "../auth";

function jsonResponse(status: number, data: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
    } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("Login", () => {
    it("autentica e chama onLoggedIn", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: "jwt" }));
        const onLoggedIn = vi.fn();

        render(<Login onLoggedIn={onLoggedIn} />);

        await userEvent.type(screen.getByLabelText("Usuário"), "admin");
        await userEvent.type(screen.getByLabelText("Senha"), "s3cret");
        await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

        expect(onLoggedIn).toHaveBeenCalledOnce();
        expect(getToken()).toBe("jwt");
    });

    it("mostra mensagem de erro em credenciais inválidas", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(401, { message: "Usuário ou senha inválidos." }),
        );
        const onLoggedIn = vi.fn();

        render(<Login onLoggedIn={onLoggedIn} />);
        await userEvent.type(screen.getByLabelText("Usuário"), "admin");
        await userEvent.type(screen.getByLabelText("Senha"), "errada");
        await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

        expect(await screen.findByText("Usuário ou senha inválidos.")).toBeInTheDocument();
        expect(onLoggedIn).not.toHaveBeenCalled();
    });
});
