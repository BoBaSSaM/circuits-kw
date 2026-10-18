import { Router, type IRouter } from "express";
import usersRouter from "./users";
import catalogRouter from "./catalog";
import ordersRouter from "./orders";
import adminRouter from "./admin";
import userCartsRouter from "./user-carts";
import stripePaymentsRouter from "./stripe-payments";

const router: IRouter = Router();

router.use(usersRouter);
router.use(userCartsRouter);
router.use(catalogRouter);
router.use(ordersRouter);
router.use(stripePaymentsRouter);
router.use(adminRouter);

export default router;
