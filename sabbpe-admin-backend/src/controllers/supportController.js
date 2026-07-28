import bcrypt from "bcrypt";
import { supabase } from "../config/supabase.js";

export const createSupport = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 🔐 Only admin allowed
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase.from("users").insert([
      {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: "support",
      },
    ]);

    if (error) throw error;

    res.json({ message: "Support user created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};