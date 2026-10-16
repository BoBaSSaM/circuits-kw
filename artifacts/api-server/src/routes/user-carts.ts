import { getAuth } from "@clerk/express";
import {
  GetMyCartResponse,
  SaveMyCartBody,
  SaveMyCartResponse,
  type CartItem,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getMongoDatabase } from "../lib/mongo";

type UserCartDocument = {
  _id: string;
  items: CartItem[];
  updatedAt: Date;
};

type UserCartDependencies = {
  getUserId: (req: Request) => string | undefined;
  getMongoDatabase: typeof getMongoDatabase;
  logError: typeof logger.error;
};

export function createUserCartHandlers(
  dependencies: Partial<UserCartDependencies> = {},
) {
  const getUserId = dependencies.getUserId ?? ((req: Request) => getAuth(req).userId);
  const getDatabase = dependencies.getMongoDatabase ?? getMongoDatabase;
  const logError = dependencies.logError ?? logger.error.bind(logger);

  const getCart = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }

    try {
      const database = await getDatabase();
      const document = await database
        .collection<UserCartDocument>("user_carts")
        .findOne({ _id: userId });
      res.status(200).json(
        GetMyCartResponse.parse({ items: document?.items ?? [] }),
      );
    } catch (error) {
      logError(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not load the signed-in buyer's cart",
      );
      res.status(503).json({ error: "cart_load_failed" });
    }
  };

  const saveCart = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }

    const input = SaveMyCartBody.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "invalid_cart" });
      return;
    }

    try {
      const database = await getDatabase();
      const items = input.data.items as CartItem[];
      await database.collection<UserCartDocument>("user_carts").updateOne(
        { _id: userId },
        { $set: { items, updatedAt: new Date() } },
        { upsert: true },
      );
      res.status(200).json(SaveMyCartResponse.parse({ items }));
    } catch (error) {
      logError(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not save the signed-in buyer's cart",
      );
      res.status(503).json({ error: "cart_save_failed" });
    }
  };

  return { getCart, saveCart };
}

const router: IRouter = Router();
const handlers = createUserCartHandlers();

router.get("/users/me/cart", handlers.getCart);
router.put("/users/me/cart", handlers.saveCart);

export default router;
