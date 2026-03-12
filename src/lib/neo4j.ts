import neo4j, { type Driver } from "neo4j-driver";

/**
 * Neo4j Aura driver singleton.
 * Reuses the connection across serverless invocations in development.
 */

const globalForNeo4j = globalThis as unknown as { neo4jDriver: Driver };

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    throw new Error(
      "Missing Neo4j configuration. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in env."
    );
  }

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

/** Lazy-initialized Neo4j driver — only connects when first accessed at runtime. */
export function getNeo4jDriver(): Driver {
  if (globalForNeo4j.neo4jDriver) return globalForNeo4j.neo4jDriver;
  const driver = createDriver();
  globalForNeo4j.neo4jDriver = driver;
  return driver;
}

/** @deprecated Use getNeo4jDriver() — this eager export breaks builds without Neo4j env vars */
export const neo4jDriver = null as unknown as Driver;

/**
 * Run a read query against Neo4j.
 */
export async function neo4jRead<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = getNeo4jDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Run a write query against Neo4j.
 */
export async function neo4jWrite<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = getNeo4jDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}
