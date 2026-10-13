import { MongoClient, type Db } from "mongodb";

const databaseName = "circuits_kw";
let clientPromise: Promise<MongoClient> | undefined;

export async function getMongoDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URL;
  if (!uri) {
    throw new Error("MONGODB_URL is required.");
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
  return client.db(databaseName);
}
