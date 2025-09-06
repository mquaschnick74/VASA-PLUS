import React from 'react';
import { THERAPEUTIC_AGENTS, TherapeuticAgent } from '../config/agent-configs';

interface AgentSelectorProps {
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  disabled?: boolean;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({ 
  selectedAgentId, 
  onSelectAgent, 
  disabled 
}) => {
  return (
    <div className="agent-selector">
      <h3 className="agent-selector-title">Choose Your Guide</h3>
      <div className="agent-grid">
        {THERAPEUTIC_AGENTS.map(agent => (
          <button
            key={agent.id}
            className={`agent-card ${selectedAgentId === agent.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onSelectAgent(agent.id)}
            disabled={disabled}
            data-testid={`agent-selector-${agent.id}`}
          >
            <div className="agent-icon">{agent.icon}</div>
            <h4 className="agent-name">{agent.name}</h4>
            <p className="agent-description">{agent.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentSelector;