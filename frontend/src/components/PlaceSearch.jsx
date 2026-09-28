import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";

/**
 * 장소 검색 (Google Places API New - Text Search)
 * - GOOGLE_KEY가 있으면 Google Places 사용 (건물/베뉴명 정확도 ↑)
 * - 없으면 Mapbox Geocoding 폴백
 * - 결과 선택 시 지도 flyTo + onPick(선택 장소) 콜백
 */
export default function PlaceSearch({ onPick }) {
  const env = useAppStore((s) => s.env);
  const mapApi = useAppStore((s) => s.mapApi);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const cacheRef = useRef(new Map());

  const provider = env?.GOOGLE_KEY ? "google" : env?.MB_TOK ? "mapbox" : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const root = document.getElementById("addrSearch");
      if (root && !root.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    const qKey = `${provider}:${query.toLowerCase()}`;
    if (!open) return;
    if (!query || query.length < 2 || !provider) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const cached = cacheRef.current.get(qKey);
      if (cached) {
        setItems(cached);
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      abortRef.current?.abort?.();
      abortRef.current = controller;
      setLoading(true);
      try {
        let next = [];
        if (provider === "google") {
          const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": env.GOOGLE_KEY,
              "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types",
            },
            body: JSON.stringify({ textQuery: query, languageCode: "ko", maxResultCount: 6 }),
          });
          const data = await res.json();
          next = (data?.places || [])
            .map((p) => ({
              id: p.id,
              label: p.displayName?.text || p.formattedAddress || "",
              sub: p.formattedAddress || "",
              lng: p.location?.longitude,
              lat: p.location?.latitude,
            }))
            .filter((x) => Number.isFinite(x.lng) && Number.isFinite(x.lat));
        } else {
          const url =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
            `?autocomplete=true&limit=6&language=ko&types=poi,place,address&access_token=${env.MB_TOK}`;
          const res = await fetch(url, { signal: controller.signal });
          const data = await res.json();
          next = (data?.features || [])
            .map((f) => ({
              id: f.id,
              label: f.text || f.place_name,
              sub: f.place_name || "",
              lng: f.center?.[0],
              lat: f.center?.[1],
              place_type: Array.isArray(f.place_type) ? f.place_type[0] : null,
            }))
            .filter((x) => Number.isFinite(x.lng) && Number.isFinite(x.lat));
          const rank = (t) => (t === "poi" ? 0 : t === "place" ? 1 : t === "address" ? 2 : 3);
          next.sort((a, b) => rank(a.place_type) - rank(b.place_type));
        }
        cacheRef.current.set(qKey, next);
        setItems(next);
      } catch (e) {
        if (e?.name !== "AbortError") setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open, provider, env?.GOOGLE_KEY, env?.MB_TOK]);

  return (
    <div id="addrSearch" role="search" onMouseDown={(e) => e.stopPropagation()}>
      <div className={`addr-box ${open ? "open" : ""}`}>
        <input
          className="addr-input"
          value={q}
          placeholder={provider === "google" ? "장소·베뉴 검색 (Google)" : "장소·베뉴 검색"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className="addr-clear"
          aria-label="검색어 지우기"
          onClick={() => {
            setQ("");
            setItems([]);
            setOpen(false);
          }}
        >
          ✕
        </button>
      </div>
      {open ? (
        <div className="addr-results" onMouseDown={(e) => e.preventDefault()}>
          {!provider ? (
            <div className="addr-empty">GOOGLE_KEY 또는 MB_TOK이 없어 장소 검색을 사용할 수 없습니다.</div>
          ) : loading ? (
            <div className="addr-empty">검색 중…</div>
          ) : items.length === 0 ? (
            <div className="addr-empty">{q.trim().length < 2 ? "2글자 이상 입력해 주세요." : "검색 결과가 없습니다."}</div>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                type="button"
                className="addr-item"
                onClick={() => {
                  mapApi?.flyTo?.({ lng: it.lng, lat: it.lat, zoom: 15 });
                  setQ(it.label);
                  setOpen(false);
                  onPick?.(it);
                }}
              >
                <div className="addr-title">{it.label}</div>
                <div className="addr-sub">{it.sub || `${it.lat.toFixed(5)}, ${it.lng.toFixed(5)}`}</div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
