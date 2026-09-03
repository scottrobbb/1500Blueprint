import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePortalConfigurationId,
  type PortalConfigurationDeps,
} from "./portal-configuration";

test("a configuration named by env is refused when it still allows cancelling", async () => {
  const calls = tracker();
  await assert.rejects(
    () => resolvePortalConfigurationId(
      deps(calls, { configuredId: () => "bpc_open", retrieve: async () => configuration("bpc_open", true) }),
      cache(),
    ),
    /allows cancelling/,
  );
  // Refusing is the point: no portal session may be opened against it.
  assert.deepEqual(calls.created, 0);
});

test("a configuration named by env is used once cancelling is confirmed off", async () => {
  const store = cache();
  const id = await resolvePortalConfigurationId(
    deps(tracker(), { configuredId: () => "bpc_safe", retrieve: async () => configuration("bpc_safe", false) }),
    store,
  );

  assert.equal(id, "bpc_safe");
  assert.equal(store.current?.id, "bpc_safe");
});

test("a verified answer is reused until it expires, then re-checked", async () => {
  const calls = tracker();
  const store = cache();
  let clock = 1_000;
  const d = deps(calls, {
    now: () => clock,
    configuredId: () => "bpc_safe",
    retrieve: async () => {
      calls.retrieved += 1;
      return configuration("bpc_safe", false);
    },
  });

  await resolvePortalConfigurationId(d, store);
  await resolvePortalConfigurationId(d, store);
  assert.equal(calls.retrieved, 1);

  clock += 5 * 60 * 1000;
  await resolvePortalConfigurationId(d, store);
  assert.equal(calls.retrieved, 2, "an expired answer is verified against Stripe again");
});

test("a cached answer does not survive a Dashboard edit that re-enables cancelling", async () => {
  const calls = tracker();
  const store = cache();
  let clock = 1_000;
  let cancellable = false;
  const d = deps(calls, {
    now: () => clock,
    configuredId: () => "bpc_safe",
    retrieve: async () => configuration("bpc_safe", cancellable),
  });

  assert.equal(await resolvePortalConfigurationId(d, store), "bpc_safe");

  cancellable = true;
  clock += 5 * 60 * 1000;
  await assert.rejects(() => resolvePortalConfigurationId(d, store), /allows cancelling/);
});

test("our own configuration is rewritten when it is stale or allows cancelling", async () => {
  for (const stored of [
    configuration("bpc_ours", true, "1"),
    configuration("bpc_ours", false, "0"),
  ]) {
    const calls = tracker();
    const id = await resolvePortalConfigurationId(
      deps(calls, { configuredId: () => undefined, list: async () => [stored] }),
      cache(),
    );
    assert.equal(id, "bpc_ours");
    assert.equal(calls.updated, 1);
  }
});

test("a matching current configuration is used as is, and none is created", async () => {
  const calls = tracker();
  const id = await resolvePortalConfigurationId(
    deps(calls, {
      configuredId: () => undefined,
      list: async () => [configuration("bpc_ours", false, "1")],
    }),
    cache(),
  );

  assert.equal(id, "bpc_ours");
  assert.equal(calls.updated, 0);
  assert.equal(calls.created, 0);
});

test("with nothing to reuse a configuration is created", async () => {
  const calls = tracker();
  const id = await resolvePortalConfigurationId(
    deps(calls, { configuredId: () => undefined, list: async () => [] }),
    cache(),
  );

  assert.equal(id, "bpc_new");
  assert.equal(calls.created, 1);
});

type Calls = { retrieved: number; updated: number; created: number };

function tracker(): Calls {
  return { retrieved: 0, updated: 0, created: 0 };
}

function cache(): { current: { id: string; verifiedAt: number } | null } {
  return { current: null };
}

function configuration(id: string, cancellable: boolean, version = "1") {
  return {
    id,
    metadata: { platform: "1500_blueprint", config_version: version },
    features: { subscription_cancel: { enabled: cancellable } },
  };
}

function deps(calls: Calls, overrides: Partial<PortalConfigurationDeps> = {}): PortalConfigurationDeps {
  return {
    now: () => 1_000,
    configuredId: () => undefined,
    retrieve: async (id) => configuration(id, false),
    list: async () => [],
    update: async (id) => {
      calls.updated += 1;
      return configuration(id, false);
    },
    create: async () => {
      calls.created += 1;
      return configuration("bpc_new", false);
    },
    ...overrides,
  };
}
