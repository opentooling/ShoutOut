import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import { insertUser } from "../../../test/factories";
import { escapeLike, findPerson, searchPeople } from "./search";

describe("searchPeople (postgres)", () => {
  const db = useTestDb();

  it("matches names anywhere and emails by prefix, excluding the viewer and inactive people", async () => {
    const make = (name: string, email: string, active = true) =>
      insertUser(db, { keycloakId: email, email, name, active });
    const viewer = await make("Hannah Viewer", "hannah@acme.io");
    await make("Henry Hughes", "henry@acme.io");
    await make("Carol Chen", "carol@acme.io");
    await make("Ex Colleague", "hector@acme.io", false);
    await make("Beth", "bh@acme.io");

    const names = async (q: string, limit?: number) =>
      (await searchPeople(db, viewer.id, q, limit)).map((p) => p.name);

    expect(await names("h")).toEqual(["Beth", "Carol Chen", "Henry Hughes"]);
    expect(await names("HUGH")).toEqual(["Henry Hughes"]);
    expect(await names("carol@")).toEqual(["Carol Chen"]);
    expect(await names("acme")).toEqual([]);
    expect(await names("  ")).toEqual(["Beth", "Carol Chen", "Henry Hughes"]);
    expect(await names("", 1)).toEqual(["Beth"]);
    expect(
      (await searchPeople(db, viewer.id, "han", 8, { includeSelf: true })).map((p) => p.name),
    ).toEqual(["Hannah Viewer"]);
    expect((await searchPeople(db, viewer.id, "henry"))[0]).toEqual({
      id: expect.any(String),
      name: "Henry Hughes",
      email: "henry@acme.io",
    });
  });

  it("treats LIKE wildcards literally and finds a person by id", async () => {
    const viewer = await insertUser(db, { keycloakId: "v", email: "v@acme.io", name: "Viewer" });
    const percent = await insertUser(db, { keycloakId: "p", email: "p@acme.io", name: "100% Pat" });
    await insertUser(db, { keycloakId: "u", email: "u@acme.io", name: "Under_score" });
    expect((await searchPeople(db, viewer.id, "%")).map((p) => p.name)).toEqual(["100% Pat"]);
    expect((await searchPeople(db, viewer.id, "_")).map((p) => p.name)).toEqual(["Under_score"]);
    expect(escapeLike("a\\b%c_d")).toBe("a\\\\b\\%c\\_d");
    expect(await findPerson(db, percent.id)).toEqual({
      id: percent.id,
      name: "100% Pat",
      email: "p@acme.io",
      active: true,
    });
    expect(await findPerson(db, "missing")).toBeNull();
  });
});
