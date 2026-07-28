
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";

/* =========================
   REGISTER
========================= */
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          name,
          email,
          password: hashedPassword,
          role: role || "support",
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   LOGIN
========================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Account disabled" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   GET SUPPORT USERS
========================= */
export const getSupportUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_active")
      .eq("role", "support");

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   CREATE SUPPORT
========================= */
export const createSupportUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase.from("users").insert([
      {
        name,
        email,
        password: hashedPassword,
        role: "support",
        is_active: true,
      },
    ]);

    if (error) throw error;

    res.json({ message: "Support created successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   ENABLE / DISABLE SUPPORT
========================= */
export const toggleSupportStatus = async (req, res) => {
  try {
    const { userId } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", userId)
      .single();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { error } = await supabase
      .from("users")
      .update({ is_active: !user.is_active })
      .eq("id", userId);

    if (error) throw error;

    res.json({ message: "Support status updated" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   DELETE SUPPORT
========================= */
export const deleteSupportUser = async (req, res) => {
  try {
    const { userId } = req.body;

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", userId)
      .eq("role", "support");

    if (error) throw error;

    res.json({ message: "Support deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};