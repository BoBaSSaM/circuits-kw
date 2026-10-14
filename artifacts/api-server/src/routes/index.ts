import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import catalogRouter from "./catalog";
import ordersRouter from "./orders";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(catalogRouter);
router.use(ordersRouter);
router.use(adminRouter);

export default router;
