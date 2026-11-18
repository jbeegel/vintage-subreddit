"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { mount } from "@/lib/claimboard/app";

/** The page shell. The app script renders each section into #main and the sign-in controls into #auth. */
export default function Claimboard() {
  useEffect(() => {
    mount((url: string, key: string) => createClient(url, key));
  }, []);

  return (
    <div className="wrap">
      <header className="top">
        <h1>
          Reddit <span>Sales Tool</span>
        </h1>
        <p className="sub">Scan a table of vintage cards, price them, build the sale post, track claims.</p>
        <div id="auth" className="row" style={{ marginLeft: "auto" }} />
      </header>
      <nav id="nav" aria-label="Sections">
        <a href="#inventory">
          Inventory<span className="n" id="n-inv" />
        </a>
        <a href="#post">Post</a>
        <a href="#claims">
          Claims<span className="n" id="n-claims" />
        </a>
        <a href="#ship">Ship</a>
        <a href="#sold">Sold comps</a>
        <a href="#grade">Grade test</a>
        <a href="#radar">Deal radar</a>
      </nav>
      <main id="main" />
    </div>
  );
}
