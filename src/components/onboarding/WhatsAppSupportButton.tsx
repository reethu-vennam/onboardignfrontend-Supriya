import React from "react";

const WHATSAPP_NUMBER = "919958750013";
const SUPPORT_MESSAGE = `Hello SabPe Support Team,\n\nI am currently in the process of completing my merchant onboarding application and have encountered an issue that is preventing me from proceeding further.\n\nI have carefully reviewed the information provided, but I am still unable to resolve the problem on my own. I kindly request your assistance in guiding me through the necessary steps to complete the onboarding successfully.\n\nPlease let me know the required actions or documents, if any.\n\nThank you for your time and support.`;

interface Props {
  message?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const WhatsAppSupportButton: React.FC<Props> = ({
  message = SUPPORT_MESSAGE,
  className = "",
  style = {},
}) => {
  const handleClick = () => {
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, "_blank");
  };

  return (
    <button
      onClick={handleClick}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#25D366",
        color: "white",
        fontWeight: 600,
        fontSize: 16,
        padding: "12px 28px",
        borderRadius: 8,
        textDecoration: "none",
        marginTop: 8,
        gap: "10px",
        boxShadow: "0 2px 8px rgba(37,211,102,0.15)",
        border: "none",
        cursor: "pointer",
        ...style,
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <g>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.031-.967-.273-.099-.471-.148-.67.15-.198.297-.767.967-.94 1.166-.173.198-.347.223-.644.075-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.571-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.099 3.2 5.077 4.363.71.306 1.263.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.288.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#fff"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.762.462 3.484 1.34 4.997L2.003 22l5.122-1.342c1.46.799 3.09 1.222 4.879 1.222 5.514 0 9.997-4.483 9.997-9.997 0-2.662-1.037-5.164-2.921-7.047-1.884-1.884-4.386-2.921-7.048-2.921zm-8.063 14.47c-.807-1.357-1.237-2.908-1.237-4.473 0-4.411 3.588-7.999 7.999-7.999 2.137 0 4.146.832 5.656 2.343 1.511 1.51 2.343 3.519 2.343 5.656 0 4.411-3.588 7.999-7.999 7.999-1.437 0-2.84-.387-4.062-1.126l-.282-.167-3.718.974.8-3.207-.2-.304z" fill="#fff"/>
        </g>
      </svg>
      WhatsApp Support
    </button>
  );
};
