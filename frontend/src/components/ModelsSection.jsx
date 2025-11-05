import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  padding: 30px;
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 24px;
    margin: 0;
    font-family: ${props => props.theme.fonts.display};

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${props => props.theme.colors.text.secondary};

  i {
    font-size: 48px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 16px;
    opacity: 0.6;
  }

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 16px 0 8px;
  }
`;

const ModelsSection = ({ systemData, socket, isConnected }) => {
  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-brain"></i>
          AI Models
        </h2>
      </SectionHeader>
      
      <EmptyState>
        <i className="fas fa-brain"></i>
        <h3>AI Models</h3>
        <p>Model management and loading interface coming soon...</p>
      </EmptyState>
    </Container>
  );
};

export default ModelsSection;