import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

async function getClient() {
  return clientPromise;
}

/**
 * Canonical databases
 * These names are part of the domain model, not configuration
 */
export async function dbBLD(): Promise<Db> {
  const c = await getClient();
  return c.db("bld");
}

export async function dbLDCO(): Promise<Db> {
  const c = await getClient();
  return c.db("ldco");
}

export async function dbLDCOReviews(): Promise<Db> {
  const c = await getClient();
  return c.db("ldco-reviews");
}
