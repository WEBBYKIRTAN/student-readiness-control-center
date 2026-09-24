import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

import {
  loginSchema,
  registerSchema,
} from "../validators/auth.schema.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| POST /api/auth/register
|--------------------------------------------------------------------------
*/

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(
      req.body,
    );

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid registration request",
        details: parsed.error.flatten(),
      });

      return;
    }

    const {
      tenantId,
      email,
      name,
      password,
    } = parsed.data;

    /*
    |--------------------------------------------------------------------------
    | Verify tenant exists and is active
    |--------------------------------------------------------------------------
    */

    const tenant =
      await prisma.tenant.findUnique({
        where: {
          id: tenantId,
        },
      });

    if (!tenant) {
      res.status(404).json({
        error: "Tenant not found",
      });

      return;
    }

    if (tenant.status !== "ACTIVE") {
      res.status(403).json({
        error: "Tenant is not active",
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Prevent duplicate account inside tenant
    |--------------------------------------------------------------------------
    */

    const existingUser =
      await prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId,
            email,
          },
        },
      });

    if (existingUser) {
      res.status(409).json({
        error:
          "An account with this email already exists for this tenant",
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Hash password
    |--------------------------------------------------------------------------
    */

    const passwordHash =
      await bcrypt.hash(password, 12);

    /*
    |--------------------------------------------------------------------------
    | Create user
    |--------------------------------------------------------------------------
    */

    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        name,
        passwordHash,
      },

      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
      },
    });

    res.status(201).json({
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/*
|--------------------------------------------------------------------------
| POST /api/auth/login
|--------------------------------------------------------------------------
*/

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(
      req.body,
    );

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid login request",
        details: parsed.error.flatten(),
      });

      return;
    }

    const {
      tenantId,
      email,
      password,
    } = parsed.data;

    /*
    |--------------------------------------------------------------------------
    | Find user INSIDE authenticated tenant context
    |--------------------------------------------------------------------------
    */

    const user =
      await prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId,
            email,
          },
        },

        include: {
          tenant: true,
        },
      });

    /*
    |--------------------------------------------------------------------------
    | Do not reveal whether account exists
    |--------------------------------------------------------------------------
    */

    if (!user) {
      res.status(401).json({
        error: "Invalid email, password, or tenant",
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Tenant must be active
    |--------------------------------------------------------------------------
    */

    if (user.tenant.status !== "ACTIVE") {
      res.status(403).json({
        error: "Tenant is not active",
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Verify password
    |--------------------------------------------------------------------------
    */

    const passwordValid =
      await bcrypt.compare(
        password,
        user.passwordHash,
      );

    if (!passwordValid) {
      res.status(401).json({
        error: "Invalid email, password, or tenant",
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | JWT
    |--------------------------------------------------------------------------
    |
    | tenantId comes from the database-backed authenticated
    | user, not from an arbitrary future request.
    |--------------------------------------------------------------------------
    */

    const payload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

   const token = jwt.sign(
  payload,
  env.jwtSecret,
  {
    expiresIn: env.jwtExpiresIn as `${number}${"s" | "m" | "h" | "d" | "w" | "y"}`,
  },
);

    res.status(200).json({
      data: {
        accessToken: token,

        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/auth/me
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  authenticate,
  async (
    req: AuthenticatedRequest,
    res,
    next,
  ) => {
    try {
      const user =
        await prisma.user.findFirst({
          where: {
            id: req.user!.userId,
            tenantId: req.user!.tenantId,
          },

          select: {
            id: true,
            tenantId: true,
            email: true,
            name: true,
            role: true,

            tenant: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        });

      if (!user) {
        res.status(401).json({
          error: "User no longer exists",
        });

        return;
      }

      if (user.tenant.status !== "ACTIVE") {
        res.status(403).json({
          error: "Tenant is not active",
        });

        return;
      }

      res.status(200).json({
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;