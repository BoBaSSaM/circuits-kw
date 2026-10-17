import { MongoClient, type Db } from "mongodb";

const databaseName = "circuits_kw";
let clientPromise: Promise<MongoClient> | undefined;
let indexesPromise: Promise<void> | undefined;

export async function getMongoDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim() || process.env.MONGODB_URL?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI (or the legacy MONGODB_URL) is required.");
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { authSource: "admin" })
      .connect()
      .catch((error: unknown) => {
        clientPromise = undefined;
        throw error;
      });
  }

  const client = await clientPromise;
  const database = client.db(databaseName);

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      database.collection("products").createIndex({ sku: 1 }, { unique: true }),
      database.collection("project_kits").createIndex({ code: 1 }, { unique: true }),
      database.collection("orders").createIndex({ orderNumber: 1 }, { unique: true }),
      database.collection("orders").createIndex({ placedAt: -1 }),
      database.collection("orders").createIndex(
        { stripeCheckoutSessionId: 1 },
        { unique: true, sparse: true },
      ),
      database.collection("users").createIndex({ role: 1 }),
      database.collection("dashboard_audit").createIndex({ timestamp: -1 }),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        indexesPromise = undefined;
        throw error;
      });
  }

  await indexesPromise;
  return database;
}

export async function closeMongoConnection(): Promise<void> {
  const pendingClient = clientPromise;
  clientPromise = undefined;
  indexesPromise = undefined;

  if (pendingClient) {
    await (await pendingClient).close();
  }
}
