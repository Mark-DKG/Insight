import React from "react";
import { AddToCart, Gallery, ShareButtons, VisitTracker, CartBadge, SearchSort } from "../../../components/store/store-client";
import "./store-css";
export default function S() {
  return (
    <div className="st"><div className="st-head"><div className="st-wrap st-head-row"><CartBadge /></div></div>
      <div className="st-wrap st-prod">
        <Gallery imageIds={["img1", "img2"]} fallback={null} title="Rice 5kg" />
        <div><VisitTracker targetType="listing" targetId="l1" /><AddToCart listingId="l1" available={4} /><AddToCart listingId="l2" available={0} /><SearchSort value="" />
          <ShareButtons url="http://h.test/store/p/l1" title="Rice 5kg" targetType="listing" targetId="l1" /></div>
      </div></div>
  );
}
