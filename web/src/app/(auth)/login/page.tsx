"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Github, Mail, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { login } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(email, password);
      setUser(res.user);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

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
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mb-8 flex flex-col items-center gap-3"
        >
          <motion.div
            className="relative"
            whileHover={{ scale: 1.08, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <img src="/openmodelstudio-logo.png" alt="OpenModelStudio" className="h-16 w-auto drop-shadow-lg" />
            <div className="absolute -inset-2 bg-white/5 blur-xl rounded-full" />
          </motion.div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">
              <span className="text-white">
                OpenModelStudio
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>
        </motion.div>

        {/* Social Logins */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mb-6 grid grid-cols-2 gap-3"
        >
          <div className="relative">
            <Button
              variant="outline"
              className="w-full gap-2 border bg-accent/50 opacity-50 cursor-not-allowed"
              disabled
            >
              <Github className="h-4 w-4" /> GitHub
            </Button>
            <Badge className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-[9px] border-muted">Soon</Badge>
          </div>
          <div className="relative">
            <Button
              variant="outline"
              className="w-full gap-2 border bg-accent/50 opacity-50 cursor-not-allowed"
              disabled
            >
              <Mail className="h-4 w-4" /> Google
            </Button>
            <Badge className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-[9px] border-muted">Soon</Badge>
          </div>
        </motion.div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="gradient-divider" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/80 px-3 text-xs text-muted-foreground">
            or continue with email
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Field */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            <Label
              htmlFor="email"
              className={`text-xs transition-colors duration-300 ${focusedField === "email" ? "text-white" : "text-muted-foreground"}`}
            >
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              className="border bg-accent/50 input-glow transition-all duration-300"
              required
            />
          </motion.div>

          {/* Password Field */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className={`text-xs transition-colors duration-300 ${focusedField === "password" ? "text-white" : "text-muted-foreground"}`}
              >
                Password
              </Label>
              <span className="text-xs text-muted-foreground cursor-default">
                Forgot password?
              </span>
            </div>
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
          </motion.div>

          {/* Remember Me */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-2"
          >
            <Switch
              checked={remember}
              onCheckedChange={setRemember}
              className="scale-75"
            />
            <span className="text-xs text-muted-foreground">Remember me</span>
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
              Sign In
            </Button>
          </motion.div>
        </form>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-white hover:text-neutral-300 transition-colors">
            Create one
          </Link>
        </motion.p>
      </div>
    </motion.div>
  );
}
