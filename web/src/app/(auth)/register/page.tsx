"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { register } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

function PasswordStrength({ password }: { password: string }) {
  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const labels = ["Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-red-500", "bg-amber-500", "bg-neutral-400", "bg-emerald-500"];

  if (!password) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="space-y-1.5"
    >
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < strength ? colors[strength - 1] : "bg-accent"}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
          />
        ))}
      </div>
      <p className={`text-xs ${strength <= 1 ? "text-red-400" : strength === 2 ? "text-amber-400" : strength === 3 ? "text-neutral-400" : "text-emerald-400"}`}>
        {labels[strength - 1] || "Too short"}
      </p>
    </motion.div>
  );
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const router = useRouter();
  const { setUser } = useAuth();

  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await register({ username: email.split("@")[0], email, password, display_name: name });
      setUser(res.user);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { id: "name", label: "Full Name", type: "text", placeholder: "John Doe", value: name, onChange: setName },
    { id: "email", label: "Email Address", type: "email", placeholder: "you@example.com", value: email, onChange: setEmail },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="rounded-2xl border bg-accent/50 p-8 shadow-2xl backdrop-blur-2xl noise-overlay">
        {/* Logo + Title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8 flex flex-col items-center gap-3"
        >
          <motion.div
            className="relative"
            whileHover={{ scale: 1.08, rotate: -5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <img src="/openmodelstudio-logo.png" alt="OpenModelStudio" className="h-16 w-auto drop-shadow-lg" />
            <div className="absolute -inset-2 bg-white/5 blur-xl rounded-full" />
          </motion.div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">
              <span className="text-white">
                Create Account
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Get started with OpenModelStudio</p>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field, i) => (
            <motion.div
              key={field.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="space-y-2"
            >
              <Label
                htmlFor={field.id}
                className={`text-xs transition-colors duration-300 ${focusedField === field.id ? "text-white" : "text-muted-foreground"}`}
              >
                {field.label}
              </Label>
              <Input
                id={field.id}
                type={field.type}
                placeholder={field.placeholder}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                onFocus={() => setFocusedField(field.id)}
                onBlur={() => setFocusedField(null)}
                className="border bg-accent/50 input-glow transition-all duration-300"
                required
              />
            </motion.div>
          ))}

          {/* Password */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            <Label
              htmlFor="password"
              className={`text-xs transition-colors duration-300 ${focusedField === "password" ? "text-white" : "text-muted-foreground"}`}
            >
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                className="border bg-accent/50 pr-10 input-glow transition-all duration-300"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </motion.div>

          {/* Confirm Password */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
            className="space-y-2"
          >
            <Label
              htmlFor="confirm"
              className={`text-xs transition-colors duration-300 ${focusedField === "confirm" ? "text-white" : "text-muted-foreground"}`}
            >
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onFocus={() => setFocusedField("confirm")}
                onBlur={() => setFocusedField(null)}
                className={`border bg-accent/50 pr-10 input-glow transition-all duration-300 ${
                  passwordsMatch ? "border-emerald-500/40" : passwordsMismatch ? "border-red-500/40" : ""
                }`}
                required
              />
              {passwordsMatch && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
              )}
              {passwordsMismatch && (
                <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
          </motion.div>

          {/* Terms */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-start gap-3"
          >
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="mt-0.5 rounded border-border bg-accent"
              required
            />
            <span className="text-xs text-muted-foreground">
              I agree to the{" "}
              <Link href="/login" className="text-white hover:text-neutral-300 transition-colors">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/login" className="text-white hover:text-neutral-300 transition-colors">Privacy Policy</Link>
            </span>
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Button
              type="submit"
              className="relative w-full overflow-hidden bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10 btn-shimmer transition-all duration-300"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </motion.div>
        </form>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:text-neutral-300 transition-colors">Sign in</Link>
        </motion.p>
      </div>
    </motion.div>
  );
}
