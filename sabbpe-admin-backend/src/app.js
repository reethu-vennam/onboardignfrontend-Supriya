import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      // Local dev
      "http://localhost:5173",
      "http://localhost:3002",
      // UAT
      "https://supp.sabbpe.com",
      "https://onboardinguat.sabbpe.com",
      "https://mockbank.sabbpe.com",
      "https://onboardingadminbckenduat.sabbpe.com",
      // Production
      "https://suppprod.sabbpe.com",
      "https://onboarding.sabbpe.com",
      "https://mockbankprod.sabbpe.com",
      "https://onboardingadminbckendprod.sabbpe.com",
      "https://onboardingprodbckend.sabbpe.com",
      "https://camsprod.sabbpe.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);

app.get('/', (req, res) => {
  res.send('Admin Backend Running');
});

export default app;
