import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { UI, SectionBand } from "./SectionUI";

export default function CommunityBlog() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(list);
    });

    return () => unsub();
  }, []);

  return (
    <div>
      <SectionBand title="Community Blog" open={true} onToggle={() => {}} />

      <div style={{ marginTop: "1rem" }}>
        {posts.length === 0 && (
          <div style={{ color: "#3F6FA5" }}>
            No posts yet — coming soon.
          </div>
        )}

        {posts.map((p) => (
          <div
            key={p.id}
            style={{
              background: "#FFFFFF",
              border: "1px solid #D6DEE6",
              borderRadius: 10,
              padding: "1rem",
              marginBottom: "1rem"
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: "#123764" }}>
              {p.title}
            </div>

            <div style={{ fontSize: 14, color: "#1F2B3A", marginTop: 6 }}>
              {p.body}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#3F6FA5"
              }}
            >
              {p.author || "Sphere Team"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
