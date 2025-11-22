import React from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 20px;

  ${props => props.theme.media.mobile} {
    padding: 10px;
  }
`;

const ModalContainer = styled.div<{ $maxWidth?: string }>`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 16px;
  max-width: ${props => props.$maxWidth || '650px'};
  width: 100%;
  max-height: 90vh;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  
  ${props => props.theme.media.mobile} {
    max-width: 100%;
    max-height: 95vh;
    border-radius: 12px;
    margin: 0;
  }
`;

export const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, ${props => props.theme.colors.background.secondary} 0%, ${props => props.theme.colors.background.primary} 100%);
  flex-shrink: 0;
  border-radius: 16px 16px 0 0;
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
    border-radius: 12px 12px 0 0;
  }

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    
    ${props => props.theme.media.mobile} {
      font-size: 18px;
      gap: 8px;
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
      font-size: 18px;
      
      ${props => props.theme.media.mobile} {
        font-size: 16px;
      }
    }
  }
`;

export const ModalCloseButton = styled.button`
  position: absolute;
  top: 15px;
  right: 15px;
  background: transparent;
  border: none;
  color: ${props => props.theme.colors.text.secondary};
  cursor: pointer;
  font-size: 18px;
  padding: 5px;
  z-index: 1;

  &:hover {
    color: ${props => props.theme.colors.text.primary};
  }
`;

export const ModalBody = styled.div`
  padding: 24px;
  background: ${props => props.theme.colors.background.primary};
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
  }

  /* Custom scrollbar styling for webkit browsers */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.border.secondary};
    border-radius: 4px;
    
    &:hover {
      background: ${props => props.theme.colors.text.secondary};
    }
  }
`;

export const ModalFooter = styled.div`
  padding: 20px 24px;
  background: ${props => props.theme.colors.background.primary};
  border-top: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 0 0 16px 16px;
  flex-shrink: 0;
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
    border-radius: 0 0 12px 12px;
  }
`;

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, maxWidth }) => {
  if (!isOpen) return null;

  return createPortal(
    <ModalOverlay onClick={onClose}>
      <ModalContainer $maxWidth={maxWidth} onClick={(e) => e.stopPropagation()}>
        {children}
      </ModalContainer>
    </ModalOverlay>,
    document.body
  );
};

export default Modal;
