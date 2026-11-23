'use client';
import React from 'react';
import './ai-orb.css';
export function AIOrb({active=false,surface=false}:{active?:boolean;surface?:boolean}){return <span className={'tcw-ai-energy-orb'+(surface?' is-surface':'')+(active?' is-thinking':'')} aria-hidden="true"><i className="ai-energy-halo"/><i className="ai-energy-ring"/><i className="ai-energy-particles"/><i className="ai-energy-core"/></span>}
